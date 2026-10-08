import db from "../../config/database/models/postgre-models/index.js";

/**
 * Helper to build hierarchical tree
 */
const buildRecursiveTree = (subfolders, parentId = null) => {
  return subfolders
    .filter((subfolder) => subfolder.parentSubfolderId === parentId)
    .map((subfolder) => ({
      ...subfolder,
      subFolder: buildRecursiveTree(subfolders, subfolder.documentCommonSubfolderId),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
};

/**
 * Format response to maintain exact parity
 */
const formatSubfolderResponse = (item) => {
  const data = item.get ? item.get({ plain: true }) : item;
  return {
    documentCommonSubfolderId: data.document_common_subfolder_id,
    documentCommonFolderId: data.document_common_folder_id,
    parentSubfolderId: data.parent_subfolder_id || null,
    name: data.name,
    sortOrder: data.sort_order,
    createdBy: data.created_by || null,
    updatedBy: data.updated_by || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
};

/**
 * CREATE DOCUMENT COMMON SUBFOLDER SERVICE
 */
export async function createDocumentCommonSubfolderService(payload, builderId, userId) {
  const { DocumentCommonSubfolder, DocumentCommonFolder } = db;
  const { document_common_folder_id, parent_subfolder_id, name, sort_order } = payload;

  const transaction = await db.sequelize.transaction();

  try {
    let finalFolderId = document_common_folder_id;

    // 1. Ownership & Path Validation
    if (parent_subfolder_id) {
      const parent = await DocumentCommonSubfolder.findOne({
        where: { document_common_subfolder_id: parent_subfolder_id },
        include: [{
          model: DocumentCommonFolder,
          as: "parentFolder",
          where: { builder_id: builderId },
          required: true,
        }],
        transaction,
      });

      if (!parent) {
        const error = new Error("Invalid parent subfolder ID or you do not have permission to create subfolder here.");
        error.status = 400;
        throw error;
      }

      if (document_common_folder_id && document_common_folder_id !== parent.document_common_folder_id) {
        const error = new Error("Provided document_common_folder_id does not match the parent subfolder's folder.");
        error.status = 400;
        throw error;
      }
      finalFolderId = parent.document_common_folder_id;
    } else {
      const folder = await DocumentCommonFolder.findOne({
        where: { document_common_folder_id: finalFolderId, builder_id: builderId },
        transaction,
      });

      if (!folder) {
        const error = new Error("You cannot create a subfolder in another builder's folder.");
        error.status = 403;
        throw error;
      }
    }

    // 2. Duplicate Name Check
    const duplicate = await DocumentCommonSubfolder.findOne({
      where: {
        document_common_folder_id: finalFolderId,
        parent_subfolder_id: parent_subfolder_id || null,
        name: db.sequelize.where(
          db.sequelize.fn("LOWER", db.sequelize.fn("TRIM", db.sequelize.col("name"))),
          name.trim().toLowerCase()
        ),
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("A subfolder with this name already exists in this location.");
      error.status = 400;
      throw error;
    }

    // 3. Sort Order Validation & Rebalancing
    const siblingCount = await DocumentCommonSubfolder.count({
      where: {
        document_common_folder_id: finalFolderId,
        parent_subfolder_id: parent_subfolder_id || null,
      },
      transaction,
    });

    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      finalSortOrder = 1;
    }

    if (finalSortOrder < 1 || finalSortOrder > siblingCount + 1) {
      const error = new Error(`Invalid sort order. User can enter only 1 to ${siblingCount + 1} sortOrder`);
      error.status = 400;
      throw error;
    }

    // Shift siblings down
    await DocumentCommonSubfolder.update(
      { sort_order: db.sequelize.literal("sort_order + 1") },
      {
        where: {
          document_common_folder_id: finalFolderId,
          parent_subfolder_id: parent_subfolder_id || null,
          sort_order: { [db.Sequelize.Op.gte]: finalSortOrder },
        },
        transaction,
      }
    );

    // 4. Create Subfolder
    const newSubfolder = await DocumentCommonSubfolder.create(
      {
        document_common_folder_id: finalFolderId,
        parent_subfolder_id: parent_subfolder_id || null,
        name: name.trim(),
        sort_order: finalSortOrder,
        created_by: userId,
        updated_by: userId,
      },
      { transaction }
    );

    await transaction.commit();
    return formatSubfolderResponse(newSubfolder);
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

/**
 * GET DOCUMENT COMMON SUBFOLDER TREE SERVICE
 */
export async function getDocumentCommonSubfolderTreeService(folderId, builderId) {
  const { DocumentCommonSubfolder, DocumentCommonFolder } = db;

  // 1. Verify Folder
  const folder = await DocumentCommonFolder.findOne({
    where: {
      document_common_folder_id: folderId,
      [db.Sequelize.Op.or]: [
        { builder_id: builderId },
        { [db.Sequelize.Op.and]: [{ builder_id: null }, { company_id: { [db.Sequelize.Op.ne]: null } }] },
      ],
    },
  });

  if (!folder) {
    const error = new Error("Invalid document_common_folder_id for this builder.");
    error.status = 400;
    throw error;
  }

  // 2. Fetch All Subfolders
  const rows = await DocumentCommonSubfolder.findAll({
    where: { document_common_folder_id: folderId },
    order: [["sort_order", "ASC"], [db.sequelize.fn("LOWER", db.sequelize.col("name")), "ASC"]],
  });

  const formattedRows = rows.map(row => formatSubfolderResponse(row));

  // 3. Build Tree
  return buildRecursiveTree(formattedRows);
}

/**
 * GET DOCUMENT COMMON SUBFOLDER BY FOLDER ID SERVICE
 */
export async function getDocumentCommonSubfolderByFolderIdService(folderId, builderId, parentSubfolderId = null) {
  const { DocumentCommonSubfolder, DocumentCommonFolder } = db;

  // 1. Verify Folder
  const folder = await DocumentCommonFolder.findOne({
    where: {
      document_common_folder_id: folderId,
      [db.Sequelize.Op.or]: [
        { builder_id: builderId },
        { [db.Sequelize.Op.and]: [{ builder_id: null }, { company_id: { [db.Sequelize.Op.ne]: null } }] },
      ],
    },
  });

  if (!folder) {
    const error = new Error("Invalid document_common_folder_id for this builder.");
    error.status = 400;
    throw error;
  }

  // 2. Fetch Subfolders at the specific level
  const rows = await DocumentCommonSubfolder.findAll({
    where: {
      document_common_folder_id: folderId,
      parent_subfolder_id: parentSubfolderId || null,
    },
    order: [["sort_order", "ASC"], [db.sequelize.fn("LOWER", db.sequelize.col("name")), "ASC"]],
  });

  return rows.map(row => formatSubfolderResponse(row));
}

/**
 * UPDATE DOCUMENT COMMON SUBFOLDER SERVICE
 */
export async function updateDocumentCommonSubfolderService(subfolderId, payload, builderId, userId) {
  const { DocumentCommonSubfolder, DocumentCommonFolder } = db;
  const { name, sort_order } = payload;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Existence & Permission Check
    const existing = await DocumentCommonSubfolder.findOne({
      where: { document_common_subfolder_id: subfolderId },
      include: [{
        model: DocumentCommonFolder,
        as: "parentFolder",
        where: { builder_id: builderId },
        required: true,
      }],
      transaction,
    });

    if (!existing) {
      const error = new Error("Invalid subfolder ID or you do not have permission to update this record.");
      error.status = 400;
      throw error;
    }

    const { document_common_folder_id, parent_subfolder_id, sort_order: oldSortOrder } = existing;

    // 2. Duplicate Name Check (within sibling scope)
    if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await DocumentCommonSubfolder.findOne({
        where: {
          document_common_folder_id,
          parent_subfolder_id: parent_subfolder_id || null,
          document_common_subfolder_id: { [db.Sequelize.Op.ne]: subfolderId },
          name: db.sequelize.where(
            db.sequelize.fn("LOWER", db.sequelize.fn("TRIM", db.sequelize.col("name"))),
            name.trim().toLowerCase()
          ),
        },
        transaction,
      });

      if (duplicate) {
        const error = new Error("A subfolder with this name already exists in this location.");
        error.status = 400;
        throw error;
      }
    }

    // 3. Sort Order Validation & Rebalancing
    if (sort_order !== undefined && sort_order !== null && sort_order !== oldSortOrder) {
      const siblingCount = await DocumentCommonSubfolder.count({
        where: {
          document_common_folder_id,
          parent_subfolder_id: parent_subfolder_id || null,
        },
        transaction,
      });

      if (sort_order < 1 || sort_order > siblingCount) {
        const error = new Error(`Invalid sort order. User can enter only 1 to ${siblingCount} sortOrder`);
        error.status = 400;
        throw error;
      }

      if (sort_order > oldSortOrder) {
        // Shift items up between old and new
        await DocumentCommonSubfolder.update(
          { sort_order: db.sequelize.literal("sort_order - 1") },
          {
            where: {
              document_common_folder_id,
              parent_subfolder_id: parent_subfolder_id || null,
              sort_order: { [db.Sequelize.Op.gt]: oldSortOrder, [db.Sequelize.Op.lte]: sort_order },
              document_common_subfolder_id: { [db.Sequelize.Op.ne]: subfolderId },
            },
            transaction,
          }
        );
      } else {
        // Shift items down between new and old
        await DocumentCommonSubfolder.update(
          { sort_order: db.sequelize.literal("sort_order + 1") },
          {
            where: {
              document_common_folder_id,
              parent_subfolder_id: parent_subfolder_id || null,
              sort_order: { [db.Sequelize.Op.gte]: sort_order, [db.Sequelize.Op.lt]: oldSortOrder },
              document_common_subfolder_id: { [db.Sequelize.Op.ne]: subfolderId },
            },
            transaction,
          }
        );
      }
      existing.sort_order = sort_order;
    }

    // 4. Perform Update
    if (name !== undefined) {
      existing.name = name.trim();
    }
    existing.updated_by = userId;
    existing.updatedAt = new Date();

    await existing.save({ transaction });
    await transaction.commit();

    return formatSubfolderResponse(existing);
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

/**
 * DELETE DOCUMENT COMMON SUBFOLDER SERVICE
 */
export async function deleteDocumentCommonSubfolderService(subfolderId, builderId) {
  const { DocumentCommonSubfolder, DocumentCommonFolder } = db;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Existence & Permission Check
    const existing = await DocumentCommonSubfolder.findOne({
      where: { document_common_subfolder_id: subfolderId },
      include: [{
        model: DocumentCommonFolder,
        as: "parentFolder",
        where: { builder_id: builderId },
        required: true,
      }],
      transaction,
    });

    if (!existing) {
      const error = new Error("Invalid subfolder ID or you do not have permission to delete this record.");
      error.status = 400;
      throw error;
    }

    const { document_common_folder_id, parent_subfolder_id, sort_order: deletedSortOrder } = existing;

    // 2. Cascade Delete (managed by DB but we trigger destroy to ensure hooks run if any)
    await existing.destroy({ transaction });

    // 3. Shift Sibling Sort Orders
    await DocumentCommonSubfolder.update(
      { sort_order: db.sequelize.literal("sort_order - 1") },
      {
        where: {
          document_common_folder_id,
          parent_subfolder_id: parent_subfolder_id || null,
          sort_order: { [db.Sequelize.Op.gt]: deletedSortOrder },
        },
        transaction,
      }
    );

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

export default {
  createDocumentCommonSubfolderService,
  getDocumentCommonSubfolderTreeService,
  getDocumentCommonSubfolderByFolderIdService,
  updateDocumentCommonSubfolderService,
  deleteDocumentCommonSubfolderService,
};
