import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";
import { invalidateNamingFormatCache } from "../../service/fileNaming.service.js";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/** Scope condition: match either builder_id or company_id */
const builderOrCompany = (builderId, companyId) => ({
  [Op.or]: [
    ...(builderId ? [{ builder_id: builderId }] : []),
    ...(companyId ? [{ company_id: companyId }] : []),
  ],
});

/**
 * Fetches folder { id, name } pairs for an array of folder UUIDs.
 */
async function getFolderNamesForIds(folderIds) {
  const { DocumentCommonFolder } = db;
  if (!folderIds?.length) {
    return [];
  }

  const folders = await DocumentCommonFolder.findAll({
    where: { document_common_folder_id: { [Op.in]: folderIds } },
    attributes: ["document_common_folder_id", "name"],
  });

  return folders.map((f) => ({
    id: f.document_common_folder_id,
    name: f.name,
  }));
}

/**
 * Validates that all folder_ids exist and belong to this builder/company.
 * Returns an error message string if invalid, null if all valid.
 */
async function validateFolderIds(folderIds, builderId, companyId, transaction) {
  const { DocumentCommonFolder } = db;
  if (!Array.isArray(folderIds) || folderIds.length === 0) {
    return null;
  }

  const found = await DocumentCommonFolder.findAll({
    where: {
      document_common_folder_id: { [Op.in]: folderIds },
      ...builderOrCompany(builderId, companyId),
    },
    attributes: ["document_common_folder_id"],
    transaction,
  });

  return found.length !== folderIds.length
    ? "One or more folder IDs are invalid or do not belong to this builder/company."
    : null;
}

/**
 * Formats a naming rule record into the API response shape.
 */
async function formatRuleResponse(record) {
  const plain = record.get ? record.get({ plain: true }) : record;
  const folderNames = await getFolderNamesForIds(plain.folder_ids);

  return {
    ...keysToCamelCase(plain),
    folderIds: plain.folder_ids || [],
    folderNames,
  };
}

// ─── SERVICE: CREATE DOCUMENT FILE NAMING RULE ───────────────────────────────

/**
 * Creates a new DocumentFileNamingRule.
 * Checks for duplicate file_type and validates folder_ids.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function createDocumentFileNamingRuleService({
  builderId,
  companyId,
  userId,
  file_type,
  folder_ids = [],
}) {
  const { DocumentFileNamingRule, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Duplicate file_type check ──────────────────────────────────────────
    const duplicate = await DocumentFileNamingRule.findOne({
      where: {
        [Op.and]: [
          sequelize.where(
            sequelize.fn("LOWER", sequelize.col("file_type")),
            file_type.trim().toLowerCase(),
          ),
          builderOrCompany(builderId, companyId),
        ],
      },
      transaction,
    });

    if (duplicate) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "A naming rule for this file type already exists for this builder.",
        },
      };
    }

    // ── Validate folder_ids ────────────────────────────────────────────────
    const folderError = await validateFolderIds(folder_ids, builderId, companyId, transaction);
    if (folderError) {
      await transaction.rollback();
      return { error: { status: 400, message: folderError } };
    }

    // ── Insert ─────────────────────────────────────────────────────────────
    const created = await DocumentFileNamingRule.create(
      {
        company_id: companyId,
        builder_id: builderId,
        file_type: file_type.trim(),
        folder_ids,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    return { data: await formatRuleResponse(created) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: GET ALL DOCUMENT FILE NAMING RULES ─────────────────────────────

/**
 * Fetches paginated DocumentFileNamingRules for a builder/company.
 *
 * @returns {{ data: object }}
 */
export async function getAllDocumentFileNamingRulesService({
  builderId,
  companyId,
  page = 1,
  limit = 25,
}) {
  const { DocumentFileNamingRule } = db;

  const offset = (Number(page) - 1) * Number(limit);

  const { count, rows } = await DocumentFileNamingRule.findAndCountAll({
    where: builderOrCompany(builderId, companyId),
    order: [["createdAt", "DESC"]],
    limit: Number(limit),
    offset,
  });

  const records = await Promise.all(rows.map((row) => formatRuleResponse(row)));

  return {
    data: {
      records,
      total: count,
      totalPages: Math.ceil(count / Number(limit)),
      currentPage: Number(page),
      limit: Number(limit),
    },
  };
}

// ─── SERVICE: DELETE DOCUMENT FILE NAMING RULE ───────────────────────────────

/**
 * Deletes a DocumentFileNamingRule by ID after authorization check.
 *
 * @returns {{ success: true }|{ error: { status: number, message: string } }}
 */
export async function deleteDocumentFileNamingRuleService({
  document_file_naming_rule_id,
  builderId,
  companyId,
}) {
  const { DocumentFileNamingRule, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const record = await DocumentFileNamingRule.findOne({
      where: {
        document_file_naming_rule_id,
        ...builderOrCompany(builderId, companyId),
      },
      attributes: ["document_file_naming_rule_id"],
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message:
            "You are not authorized to delete this document file naming rule or it does not exist.",
        },
      };
    }

    // ── Delete ─────────────────────────────────────────────────────────────
    await record.destroy({ transaction });

    await transaction.commit();

    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: UPDATE DOCUMENT FILE NAMING RULE ───────────────────────────────

/**
 * Updates an existing DocumentFileNamingRule.
 * Validates folder_ids, checks for duplicate file_type, and applies partial updates.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function updateDocumentFileNamingRuleService({
  document_file_naming_rule_id,
  builderId,
  companyId,
  userId,
  file_type,
  folder_ids,
}) {
  const { DocumentFileNamingRule, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const record = await DocumentFileNamingRule.findOne({
      where: {
        document_file_naming_rule_id,
        ...builderOrCompany(builderId, companyId),
      },
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return {
        error: {
          status: 404,
          message: "No document file naming rule found for this user.",
        },
      };
    }

    // ── Guard: at least one field required ─────────────────────────────────
    if (file_type === undefined && folder_ids === undefined) {
      await transaction.rollback();
      return { error: { status: 400, message: "No fields provided to update." } };
    }

    // ── Validate folder_ids ────────────────────────────────────────────────
    if (folder_ids !== undefined && folder_ids.length > 0) {
      const folderError = await validateFolderIds(folder_ids, builderId, companyId, transaction);
      if (folderError) {
        await transaction.rollback();
        return { error: { status: 400, message: folderError } };
      }
    }

    // ── Duplicate file_type check ──────────────────────────────────────────
    if (file_type !== undefined) {
      const duplicate = await DocumentFileNamingRule.findOne({
        where: {
          [Op.and]: [
            sequelize.where(
              sequelize.fn("LOWER", sequelize.col("file_type")),
              file_type.trim().toLowerCase(),
            ),
            builderOrCompany(builderId, companyId),
            {
              document_file_naming_rule_id: { [Op.ne]: document_file_naming_rule_id },
            },
          ],
        },
        transaction,
      });

      if (duplicate) {
        await transaction.rollback();
        return {
          error: {
            status: 400,
            message: "A document file naming rule with this file type already exists.",
          },
        };
      }
    }

    // ── Update ─────────────────────────────────────────────────────────────
    const updatePayload = {
      ...(file_type !== undefined && { file_type: file_type.trim() }),
      ...(folder_ids !== undefined && { folder_ids }),
      updated_by: userId,
    };

    await record.update(updatePayload, { transaction });

    await transaction.commit();

    return { data: await formatRuleResponse(record) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: CREATE NAMING FORMAT ───────────────────────────────────────────

/**
 * Replaces the existing naming format for a builder/company with a new one.
 * Uses a transaction: delete-all then insert.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function createNamingFormatService({
  builderId,
  companyId,
  userId,
  naming_format,
}) {
  const { DocumentFileNamingFormat, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Delete all existing formats for this scope ─────────────────────────
    await DocumentFileNamingFormat.destroy({
      where: builderOrCompany(builderId, companyId),
      transaction,
    });

    // ── Insert new format ──────────────────────────────────────────────────
    const created = await DocumentFileNamingFormat.create(
      {
        builder_id: builderId,
        company_id: companyId,
        naming_format: naming_format.trim(),
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    // Every upload reads this format through a cached lookup — drop the stale
    // entry so the very next upload uses the new format.
    invalidateNamingFormatCache({ companyId, builderId });

    return { data: keysToCamelCase(created.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: GET NAMING FORMAT ──────────────────────────────────────────────

/**
 * Fetches the latest naming format for a builder/company.
 * If none exists, creates a default row with a null naming_format.
 *
 * @returns {{ data: object }}
 */
export async function getNamingFormatService({ builderId, companyId, userId }) {
  const { DocumentFileNamingFormat, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const existing = await DocumentFileNamingFormat.findOne({
      where: builderOrCompany(builderId, companyId),
      attributes: [
        "document_file_naming_format_id",
        "naming_format",
        "created_by",
        "createdAt",
        "updated_by",
        "updatedAt",
      ],
      order: [["createdAt", "DESC"]],
      transaction,
    });

    if (!existing) {
      // Auto-create a default row with null naming_format
      const created = await DocumentFileNamingFormat.create(
        {
          builder_id: builderId,
          company_id: companyId,
          naming_format: null,
          created_by: userId,
          updated_by: userId,
        },
        { transaction },
      );

      await transaction.commit();

      return {
        data: keysToCamelCase(created.get({ plain: true })),
        message: "Default naming format created successfully.",
      };
    }

    await transaction.commit();

    return {
      data: keysToCamelCase(existing.get({ plain: true })),
      message: "Naming format retrieved successfully.",
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
