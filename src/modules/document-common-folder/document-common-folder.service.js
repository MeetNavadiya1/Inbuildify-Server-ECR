import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";

const DEFAULT_CATEGORIES = [
  "Plans & Drawings",
  "Engineering",
  "Permits & Approvals",
  "Contracts",
  "Invoices",
  "Quotes",
  "Receipts",
  "Site Photos",
  "Progress Reports",
  "Handover Documents",
  "Warranties",
  "Selections",
  "Variations",
  "Insurance Certificates",
  "Schedules",
  "Landscaping",
  "Specifications",
  "Health & Safety",
  "Correspondence",
  "Miscellaneous"
];

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/** Condition to scope queries to the current builder or company */
const builderOrCompany = (builderId, companyId) => ({
  [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
});

/**
 * Validates that all provided role IDs exist.
 * Returns an error message string if invalid, null if all valid.
 */
async function validateRoleIds(roleIds, transaction) {
  const { Role } = db;
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    return null;
  }

  const found = await Role.findAll({
    where: { role_id: { [Op.in]: roleIds } },
    attributes: ["role_id"],
    transaction,
  });

  return found.length !== roleIds.length
    ? "One or more role IDs are invalid."
    : null;
}

/**
 * Validates that all provided user IDs exist and are not deleted.
 * Returns an error message string if invalid, null if all valid.
 */
async function validateUserIds(userIds, transaction) {
  const { Users } = db;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return null;
  }

  const found = await Users.findAll({
    where: { users_id: { [Op.in]: userIds }, is_deleted: false },
    attributes: ["users_id"],
    transaction,
  });

  return found.length !== userIds.length
    ? "One or more user IDs are invalid."
    : null;
}

/**
 * Gets the current max sort_order for a builder/company scope.
 */
async function getMaxSortOrder(builderId, companyId, transaction) {
  const { DocumentCommonFolder } = db;
  const result = await DocumentCommonFolder.max("sort_order", {
    where: builderOrCompany(builderId, companyId),
    transaction,
  });
  return result || 0;
}

/**
 * Fetches role name + id for an array of role_ids.
 */
async function getRolesForIds(roleIds) {
  const { Role } = db;
  if (!roleIds?.length) {
    return [];
  }
  const roles = await Role.findAll({
    where: { role_id: { [Op.in]: roleIds } },
    attributes: ["role_id", "name"],
  });
  return roles.map((r) => ({ id: r.role_id, name: r.name }));
}

/**
 * Fetches user name + id for an array of user_ids.
 */
async function getUsersForIds(userIds) {
  const { Users } = db;
  if (!userIds?.length) {
    return [];
  }
  const users = await Users.findAll({
    where: { users_id: { [Op.in]: userIds } },
    attributes: ["users_id", "name"],
  });
  return users.map((u) => ({ id: u.users_id, name: u.name }));
}

/**
 * Formats a folder record into the API response shape,
 * enriching role_ids and user_ids with names.
 */
async function formatFolderResponse(folder) {
  const plain = folder.get ? folder.get({ plain: true }) : folder;
  const roles = await getRolesForIds(plain.role_ids);
  const users = await getUsersForIds(plain.user_ids);

  return {
    documentCommonFolderId: plain.document_common_folder_id,
    builderId: plain.builder_id,
    companyId: plain.company_id,
    name: plain.name,
    sortOrder: plain.sort_order,
    notify: plain.notify,
    shareToCustomer: plain.share_to_customer,
    isLocked: plain.is_locked,
    roles,
    users,
    createdBy: plain.created_by,
    updatedBy: plain.updated_by,
    createdAt: plain.createdAt ?? plain.created_at,
    updatedAt: plain.updatedAt ?? plain.updated_at,
  };
}

// ─── SEED DEFAULTS ────────────────────────────────────────────────────────────

export async function seedDefaultDocumentFoldersService({ builderId, companyId, createdBy }) {
  const { DocumentCommonFolder } = db;
  
  const existing = await DocumentCommonFolder.findAll({
    where: {
      ...(builderId ? { builder_id: builderId } : { company_id: companyId })
    },
    attributes: ['name']
  });
  
  const existingNames = new Set(existing.map(f => f.name.toLowerCase()));
  
  const foldersToCreate = DEFAULT_CATEGORIES
    .filter(name => !existingNames.has(name.toLowerCase()))
    .map((name, index) => ({
      name,
      builder_id: builderId || null,
      company_id: companyId || null,
      created_by: createdBy || null,
      sort_order: index + 1,
      notify: false,
      share_to_customer: false,
      is_locked: false,
      role_ids: [],
      user_ids: [],
    }));

  if (foldersToCreate.length > 0) {
    await DocumentCommonFolder.bulkCreate(foldersToCreate);
  }
  
  return { seeded: foldersToCreate.length, message: "Defaults seeded successfully." };
}

// ─── SERVICE: CREATE ──────────────────────────────────────────────────────────

/**
 * Creates a new DocumentCommonFolder.
 * Handles duplicate name check, sort_order shifting, and role/user validation.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function createDocumentCommonFolderService({
  builderId,
  companyId,
  createdBy,
  name,
  sort_order,
  notify = false,
  share_to_customer = false,
  is_locked = false,
  role_ids = [],
  user_ids = [],
}) {
  const { DocumentCommonFolder, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Unique name check ──────────────────────────────────────────────────
    const duplicate = await DocumentCommonFolder.findOne({
      where: { name, ...builderOrCompany(builderId, companyId) },
      transaction,
    });

    if (duplicate) {
      await transaction.rollback();
      return { error: { status: 400, message: "Folder name already exists." } };
    }

    // ── Sort order handling ────────────────────────────────────────────────
    const finalSortOrder = sort_order ?? 1;
    const maxSortOrder = await getMaxSortOrder(builderId, companyId, transaction);

    if (finalSortOrder < 1 || finalSortOrder > maxSortOrder + 1) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: `Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`,
        },
      };
    }

    await DocumentCommonFolder.increment("sort_order", {
      by: 1,
      where: {
        sort_order: { [Op.gte]: finalSortOrder },
        ...builderOrCompany(builderId, companyId),
      },
      transaction,
    });

    // ── Validate role/user IDs ─────────────────────────────────────────────
    const roleError = await validateRoleIds(role_ids, transaction);
    if (roleError) {
      await transaction.rollback();
      return { error: { status: 400, message: roleError } };
    }

    const userError = await validateUserIds(user_ids, transaction);
    if (userError) {
      await transaction.rollback();
      return { error: { status: 400, message: userError } };
    }

    // ── Insert ─────────────────────────────────────────────────────────────
    const created = await DocumentCommonFolder.create(
      {
        company_id: companyId,
        builder_id: builderId,
        name,
        sort_order: finalSortOrder,
        notify,
        share_to_customer,
        is_locked,
        role_ids,
        user_ids,
        created_by: createdBy,
        updated_by: createdBy,
      },
      { transaction },
    );

    await transaction.commit();

    return { data: await formatFolderResponse(created) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: GET ALL ─────────────────────────────────────────────────────────

/**
 * Fetches all DocumentCommonFolders with nested subfolder trees.
 *
 * @returns {{ data: object[] }|{ error: { status: number, message: string } }}
 */
export async function getAllDocumentCommonFoldersService({ builderId, companyId }) {
  const { DocumentCommonFolder, DocumentCommonSubfolder } = db;

  const folders = await DocumentCommonFolder.findAll({
    where: builderOrCompany(builderId, companyId),
    include: [
      {
        model: DocumentCommonSubfolder,
        as: "subfolders",
        required: false,
      },
    ],
    order: [
      ["sort_order", "ASC"],
      ["createdAt", "ASC"],
      [{ model: DocumentCommonSubfolder, as: "subfolders" }, "sort_order", "ASC"],
      [{ model: DocumentCommonSubfolder, as: "subfolders" }, "name", "ASC"],
    ],
  });

  const buildSubfolderTree = (subfolders, parentId = null) => {

    return subfolders
      .filter((sf) => sf.parent_subfolder_id === parentId)
      .map((sf) => ({
        ...keysToCamelCase(sf),
        subFolder: buildSubfolderTree(subfolders, sf.document_common_subfolder_id),
      }));
  };

  const data = await Promise.all(
    folders.map(async (folder) => {
      const plain = folder.get({ plain: true });
      const roles = await getRolesForIds(plain.role_ids);
      const users = await getUsersForIds(plain.user_ids);

      return {
        ...keysToCamelCase({ ...plain, subfolders: undefined }),
        roles,
        users,
        subfolders: buildSubfolderTree(plain.subfolders ?? [], null),
      };
    }),
  );

  return { data };
}

// ─── SERVICE: DELETE ──────────────────────────────────────────────────────────

/**
 * Deletes a DocumentCommonFolder by ID, removes it from file naming rules,
 * and re-sequences sort_order for remaining folders.
 *
 * @returns {{ success: true }|{ error: { status: number, message: string } }}
 */
export async function deleteDocumentCommonFolderService({
  document_common_folder_id,
  builderId,
  companyId,
}) {
  const { DocumentCommonFolder, DocumentFileNamingRule, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const record = await DocumentCommonFolder.findOne({
      where: {
        document_common_folder_id,
        ...builderOrCompany(builderId, companyId),
      },
      attributes: ["document_common_folder_id", "sort_order"],
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return {
        error: { status: 403, message: "You are not authorized to delete this folder." },
      };
    }

    const deletedSortOrder = record.sort_order;

    // ── Remove folder reference from file naming rules ─────────────────────
    await DocumentFileNamingRule.update(
      {
        folder_ids: sequelize.fn(
          "array_remove",
          sequelize.col("folder_ids"),
          document_common_folder_id,
        ),
      },
      {
        where: {
          [Op.and]: [
            sequelize.where(
              sequelize.fn(
                "array_position",
                sequelize.col("folder_ids"),
                document_common_folder_id,
              ),
              { [Op.ne]: null },
            ),
            { [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] },
          ],
        },
        transaction,
      },
    );

    // ── Delete ─────────────────────────────────────────────────────────────
    await record.destroy({ transaction });

    // Shift remaining sort orders up to close the gap
    await DocumentCommonFolder.decrement("sort_order", {
      by: 1,
      where: {
        sort_order: { [Op.gt]: deletedSortOrder },
        ...builderOrCompany(builderId, companyId),
      },
      transaction,
    });

    await transaction.commit();

    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: UPDATE ──────────────────────────────────────────────────────────

/**
 * Updates an existing DocumentCommonFolder.
 * Handles name uniqueness, sort_order re-sequencing, and role/user validation.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function updateDocumentCommonFolderService({
  document_common_folder_id,
  builderId,
  companyId,
  updatedBy,
  name,
  sort_order,
  notify,
  share_to_customer,
  is_locked,
  role_ids,
  user_ids,
}) {
  const { DocumentCommonFolder, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const record = await DocumentCommonFolder.findOne({
      where: {
        document_common_folder_id,
        ...builderOrCompany(builderId, companyId),
      },
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return {
        error: { status: 403, message: "You are not authorized to update this folder." },
      };
    }

    // ── Guard: at least one field required ─────────────────────────────────
    if (
      name === undefined &&
      sort_order === undefined &&
      notify === undefined &&
      share_to_customer === undefined &&
      is_locked === undefined &&
      role_ids === undefined &&
      user_ids === undefined
    ) {
      await transaction.rollback();
      return { error: { status: 400, message: "No fields provided for update." } };
    }

    // ── Name uniqueness check ──────────────────────────────────────────────
    if (name !== undefined) {
      const nameConflict = await DocumentCommonFolder.findOne({
        where: {
          name,
          document_common_folder_id: { [Op.ne]: document_common_folder_id },
          ...builderOrCompany(builderId, companyId),
        },
        transaction,
      });

      if (nameConflict) {
        await transaction.rollback();
        return {
          error: { status: 400, message: `Folder name "${name}" already exists.` },
        };
      }
    }

    // ── Sort order handling ────────────────────────────────────────────────
    const finalSortOrder = sort_order;

    if (sort_order !== undefined && sort_order !== null) {
      const maxSort = await getMaxSortOrder(builderId, companyId, transaction);

      if (sort_order < 1 || sort_order > maxSort) {
        await transaction.rollback();
        return {
          error: {
            status: 400,
            message: `Invalid sort_order. Allowed range is 1 to ${maxSort}.`,
          },
        };
      }

      const oldSortOrder = record.sort_order;

      if (sort_order !== oldSortOrder) {
        if (sort_order > oldSortOrder) {
          // Moving down: shift records between old and new position up by 1
          await DocumentCommonFolder.decrement("sort_order", {
            by: 1,
            where: {
              sort_order: { [Op.gt]: oldSortOrder, [Op.lte]: sort_order },
              document_common_folder_id: { [Op.ne]: document_common_folder_id },
              ...builderOrCompany(builderId, companyId),
            },
            transaction,
          });
        } else {
          // Moving up: shift records between new and old position down by 1
          await DocumentCommonFolder.increment("sort_order", {
            by: 1,
            where: {
              sort_order: { [Op.gte]: sort_order, [Op.lt]: oldSortOrder },
              document_common_folder_id: { [Op.ne]: document_common_folder_id },
              ...builderOrCompany(builderId, companyId),
            },
            transaction,
          });
        }
      }
    }

    // ── Validate role/user IDs ─────────────────────────────────────────────
    if (role_ids !== undefined) {
      if (!Array.isArray(role_ids)) {
        await transaction.rollback();
        return { error: { status: 400, message: "role_ids must be an array of UUIDs." } };
      }
      const roleError = await validateRoleIds(role_ids, transaction);
      if (roleError) {
        await transaction.rollback();
        return { error: { status: 400, message: roleError } };
      }
    }

    if (user_ids !== undefined) {
      if (!Array.isArray(user_ids)) {
        await transaction.rollback();
        return { error: { status: 400, message: "user_ids must be an array of UUIDs." } };
      }
      const userError = await validateUserIds(user_ids, transaction);
      if (userError) {
        await transaction.rollback();
        return { error: { status: 400, message: userError } };
      }
    }

    // ── Update ─────────────────────────────────────────────────────────────
    const updatePayload = {
      ...(name !== undefined && { name }),
      ...(finalSortOrder !== undefined && { sort_order: finalSortOrder }),
      ...(notify !== undefined && { notify }),
      ...(share_to_customer !== undefined && { share_to_customer }),
      ...(is_locked !== undefined && { is_locked }),
      ...(role_ids !== undefined && { role_ids }),
      ...(user_ids !== undefined && { user_ids }),
      updated_by: updatedBy,
    };

    await record.update(updatePayload, { transaction });

    await transaction.commit();

    return { data: await formatFolderResponse(record) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
