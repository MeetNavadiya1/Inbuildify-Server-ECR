import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/** Scope condition: match either builder_id or company_id */
const builderOrCompany = (builderId, companyId) => ({
  [Op.or]: [
    ...(builderId ? [{ builder_id: builderId }] : []),
    ...(companyId ? [{ company_id: companyId }] : []),
  ],
});

// ─── SERVICE: CREATE INTEGRATION CUSTOM FIELD HEADER ─────────────────────────

/**
 * Creates a new IntegrationCustomFieldHeader.
 * Checks for duplicate header_name (case-insensitive) within the builder/company scope.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function createIntegrationCustomFieldHeaderService({
  builderId,
  companyId,
  userId,
  header_name,
}) {
  const { IntegrationCustomFieldHeader, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Duplicate header_name check (case-insensitive) ─────────────────────
    const duplicate = await IntegrationCustomFieldHeader.findOne({
      where: {
        [Op.and]: [
          sequelize.where(
            sequelize.fn("LOWER", sequelize.col("header_name")),
            header_name.trim().toLowerCase(),
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
          message: "A header with this name already exists for this builder or company.",
        },
      };
    }

    // ── Insert ─────────────────────────────────────────────────────────────
    const created = await IntegrationCustomFieldHeader.create(
      {
        company_id: companyId,
        builder_id: builderId,
        header_name: header_name.trim(),
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    return { data: keysToCamelCase(created.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: GET ALL INTEGRATION CUSTOM FIELD HEADERS ───────────────────────

/**
 * Fetches paginated IntegrationCustomFieldHeaders for a builder/company.
 *
 * @returns {{ data: object }}
 */
export async function getAllIntegrationCustomFieldHeaderService({
  builderId,
  companyId,
  page = 1,
  limit = 25,
}) {
  const { IntegrationCustomFieldHeader } = db;

  const limitValue = parseInt(limit, 10);
  const pageValue = parseInt(page, 10);
  const offset = (pageValue - 1) * limitValue;

  const { count, rows } = await IntegrationCustomFieldHeader.findAndCountAll({
    where: builderOrCompany(builderId, companyId),
    order: [["createdAt", "DESC"]],
    limit: limitValue,
    offset,
  });

  return {
    data: {
      integrationCustomFieldHeaders: keysToCamelCase(
        rows.map((r) => r.get({ plain: true })),
      ),
      pagination: {
        currentPage: pageValue,
        totalPages: Math.ceil(count / limitValue),
        totalRecords: count,
        limit: limitValue,
      },
    },
  };
}

// ─── SERVICE: DELETE INTEGRATION CUSTOM FIELD HEADER ─────────────────────────

/**
 * Deletes an IntegrationCustomFieldHeader and handles cascading item cleanup:
 * - If it is the last header for the scope → deletes all IntegrationCustomFieldItems.
 * - Otherwise → shifts header2 data into header1 slot on affected items,
 *   then nulls out header2 references.
 *
 * @returns {{ success: true }|{ error: { status: number, message: string } }}
 */
export async function deleteIntegrationCustomFieldHeaderService({
  integration_custom_field_header_id,
  builderId,
  companyId,
}) {
  const { IntegrationCustomFieldHeader, IntegrationCustomFieldItem, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const header = await IntegrationCustomFieldHeader.findOne({
      where: {
        integration_custom_field_header_id,
        ...builderOrCompany(builderId, companyId),
      },
      attributes: ["integration_custom_field_header_id"],
      transaction,
    });

    if (!header) {
      await transaction.rollback();
      return { error: { status: 404, message: "Header not found." } };
    }

    // ── Count remaining headers in this scope ──────────────────────────────
    const headerCount = await IntegrationCustomFieldHeader.count({
      where: builderOrCompany(builderId, companyId),
      transaction,
    });

    if (headerCount === 1) {
      // Last header: wipe all items for this builder/company scope
      await IntegrationCustomFieldItem.destroy({
        where: builderOrCompany(builderId, companyId),
        transaction,
      });
    } else {
      // Promote header2 → header1 on rows where header1 is being deleted,
      // and null out header2 on any row that referenced this header.
      //
      // Sequelize doesn't support CASE expressions in update() cleanly,
      // so we use sequelize.literal for the conditional assignments.
      await IntegrationCustomFieldItem.update(
        {
          header1_id: sequelize.literal(
            `CASE WHEN header1_id = '${integration_custom_field_header_id}' THEN header2_id ELSE header1_id END`,
          ),
          value1: sequelize.literal(
            `CASE WHEN header1_id = '${integration_custom_field_header_id}' THEN value2 ELSE value1 END`,
          ),
          header2_id: sequelize.literal(
            `CASE WHEN header1_id = '${integration_custom_field_header_id}' THEN NULL
                  WHEN header2_id = '${integration_custom_field_header_id}' THEN NULL
                  ELSE header2_id END`,
          ),
          value2: sequelize.literal(
            `CASE WHEN header1_id = '${integration_custom_field_header_id}' THEN NULL
                  WHEN header2_id = '${integration_custom_field_header_id}' THEN NULL
                  ELSE value2 END`,
          ),
        },
        {
          where: {
            [Op.or]: [
              { header1_id: integration_custom_field_header_id },
              { header2_id: integration_custom_field_header_id },
            ],
          },
          transaction,
        },
      );
    }

    // ── Delete the header itself ───────────────────────────────────────────
    await header.destroy({ transaction });

    await transaction.commit();

    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: UPDATE INTEGRATION CUSTOM FIELD HEADER ─────────────────────────

/**
 * Updates an existing IntegrationCustomFieldHeader.
 * Validates ownership, checks for duplicate header_name, and applies partial update.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function updateIntegrationCustomFieldHeaderService({
  integration_custom_field_header_id,
  builderId,
  companyId,
  userId,
  header_name,
}) {
  const { IntegrationCustomFieldHeader, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const record = await IntegrationCustomFieldHeader.findOne({
      where: {
        integration_custom_field_header_id,
        ...builderOrCompany(builderId, companyId),
      },
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return {
        error: { status: 404, message: "Record not found or not owned by this builder." },
      };
    }

    // ── Guard: at least one field required ─────────────────────────────────
    if (header_name === undefined) {
      await transaction.rollback();
      return { error: { status: 400, message: "No fields provided to update." } };
    }

    // ── Duplicate header_name check (case-insensitive, exclude self) ───────
    if (header_name !== undefined) {
      const duplicate = await IntegrationCustomFieldHeader.findOne({
        where: {
          [Op.and]: [
            sequelize.where(
              sequelize.fn("LOWER", sequelize.col("header_name")),
              header_name.trim().toLowerCase(),
            ),
            builderOrCompany(builderId, companyId),
            {
              integration_custom_field_header_id: {
                [Op.ne]: integration_custom_field_header_id,
              },
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
            message: "Header name already exists for this builder/company.",
          },
        };
      }
    }

    // ── Update ─────────────────────────────────────────────────────────────
    await record.update(
      {
        header_name: header_name.trim(),
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    return { data: keysToCamelCase(record.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
