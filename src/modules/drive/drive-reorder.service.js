/**
 * Drive Reorder Service (Stage C2)
 *
 * Accepts an ordered array of items with their new sort_order values.
 * All items MUST belong to the same parent scope (parent_id for folders, folder_id for files).
 * Performs a bulk update inside a transaction.
 */

import db from "../../config/database/models/postgre-models/index.js";

/**
 * Reorder items within a parent scope.
 *
 * @param {Array}  items     - Array of { id, type, sort_order }
 * @param {string} parentId  - The parent folder ID (or "root" / null for root scope)
 * @param {string} companyId
 */
export const reorderItemsService = async (items, parentId, companyId) => {
  const { Drive, DriveFile } = db.sequelize.models;
  const scopeParentId = parentId === "root" ? null : (parentId || null);

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Items array is required and must not be empty.");
  }

  const transaction = await db.sequelize.transaction();
  try {
    for (const item of items) {
      const order = Number(item.sort_order);
      if (isNaN(order)) {
        throw new Error(`Invalid sort_order for item ${item.id}. Must be a number.`);
      }

      const type = item.type?.toLowerCase();

      if (type === "folder") {
        // Validate the folder belongs to the stated parent scope in this company
        const folder = await Drive.findOne({
          where: { drive_id: item.id, company_id: companyId, parent_id: scopeParentId },
          transaction,
        });
        if (!folder) {
          throw new Error(`Folder ${item.id} not found in scope ${scopeParentId || "root"}.`);
        }
        await folder.update({ sort_order: order }, { transaction });
      } else if (type === "file") {
        const file = await DriveFile.findOne({
          where: { file_id: item.id, company_id: companyId, folder_id: scopeParentId },
          transaction,
        });
        if (!file) {
          throw new Error(`File ${item.id} not found in scope ${scopeParentId || "root"}.`);
        }
        await file.update({ sort_order: order }, { transaction });
      } else {
        throw new Error(`Invalid item type "${item.type}". Must be "folder" or "file".`);
      }
    }

    await transaction.commit();
    return { reordered: items.length, parent_id: scopeParentId };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
