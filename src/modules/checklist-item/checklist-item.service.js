import db from "../../config/database/models/postgre-models/index.js";

export async function createChecklistItemService({
  builderId,
  checklist_id,
  construction_type_id,
  construction_stage_id,
  description,
  notes,
  is_required,
  type,
  sort,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Validate checklist belongs to builder and is active ───────────────
    const checklist = await db.Checklist.findOne({
      where: {
        checklist_id,
        builder_id: builderId,
        is_deleted: false,
        is_active: true,
      },
      attributes: ["checklist_id"],
      transaction,
    });

    if (!checklist) {
      const error = new Error("Checklist is invalid or inactive.");
      error.status = 403;
      throw error;
    }

    // ── 2. Validate construction_type_id if provided ─────────────────────────
    if (construction_type_id) {
      const constructionType = await db.ConstructionType.findOne({
        where: {
          construction_type_id,
          builder_id: builderId,
        },
        attributes: ["construction_type_id"],
        transaction,
      });

      if (!constructionType) {
        const error = new Error("Invalid construction_type_id.");
        error.status = 400;
        throw error;
      }
    }

    // ── 3. Validate construction_stage_id if provided ────────────────────────
    if (construction_stage_id) {
      const stageWhere = {
        construction_stage: construction_stage_id,
        builder_id: builderId,
      };

      if (construction_type_id) {
        stageWhere.construction_type_id = construction_type_id;
      }

      const stage = await db.ConstructionStage.findOne({
        where: stageWhere,
        attributes: ["construction_stage"],
        transaction,
      });

      if (!stage) {
        const error = new Error("Invalid construction_stage_id or mismatch with construction_type.");
        error.status = 400;
        throw error;
      }
    }

    // ── 4. Check for duplicate description in same checklist ─────────────────
    const duplicate = await db.ChecklistItem.findOne({
      where: { checklist_id, description },
      include: [
        {
          model: db.Checklist,
          as: "checklist",
          where: { builder_id: builderId, is_deleted: false },
          attributes: [],
        },
      ],
      attributes: ["checklist_item_id"],
      transaction,
    });

    if (duplicate) {
      const error = new Error("Description with this name already exists for this checklist.");
      error.status = 409;
      throw error;
    }

    // ── 5. Resolve and validate sort ─────────────────────────────────────────
    const maxSortResult = await db.ChecklistItem.max("sort", {
      where: { checklist_id },
      transaction,
    });

    const maxSort = maxSortResult ?? 0;

    if (sort == null) {
      sort = maxSort + 1;
    }

    if (sort < 1 || sort > maxSort + 1) {
      const error = new Error(`Invalid sort. Allowed range is 1 to ${maxSort + 1}.`);
      error.status = 400;
      throw error;
    }

    // ── 6. Shift existing items to make room ─────────────────────────────────
    if (sort <= maxSort) {
      await db.ChecklistItem.increment("sort", {
        by: 1,
        where: {
          checklist_id,
          sort: { [db.Sequelize.Op.gte]: sort },
        },
        transaction,
      });
    }

    // ── 7. Insert new checklist item ─────────────────────────────────────────
    const newItem = await db.ChecklistItem.create(
      {
        checklist_id,
        construction_type_id,
        construction_stage_id,
        description,
        notes,
        is_required,
        type,
        sort,
      },
      { transaction },
    );

    await transaction.commit();

    return newItem.toJSON();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Fetches all checklist items associated with a specific checklist ID
 * after verifying checklist ownership.
 */
export async function getChecklistItemsByChecklistIdService({
  builderId,
  checklist_id,
}) {
  try {
    // 1. Verify checklist exists and belongs to the builder
    const checklist = await db.Checklist.findOne({
      where: {
        checklist_id,
        builder_id: builderId,
        is_deleted: false,
      },
      attributes: ["checklist_id"],
    });

    if (!checklist) {
      const error = new Error("Checklist does not belong to this builder.");
      error.status = 403;
      throw error;
    }

    // 2. Fetch all items associated with the checklist
    const items = await db.ChecklistItem.findAll({
      where: { checklist_id },
      order: [["sort", "ASC"]],
    });

    return items.map((item) => item.get({ plain: true }));
  } catch (error) {
    console.error("error in getChecklistItemsByChecklistIdService", error);
    throw error;
  }
}

/**
 * Deletes a checklist item after verifying ownership.
 */
export async function deleteChecklistItemService({
  builderId,
  checklist_item_id,
}) {
  const transaction = await db.sequelize.transaction();
  try {
    // 1. Verify item exists and belongs to the builder (via join with Checklist)
    const item = await db.ChecklistItem.findOne({
      where: { checklist_item_id },
      include: [
        {
          model: db.Checklist,
          as: "checklist",
          where: { builder_id: builderId },
          attributes: ["checklist_id"],
          required: true,
        },
      ],
      transaction,
    });

    if (!item) {
      const error = new Error(
        "Checklist item not found or you are not allowed to delete this item",
      );
      error.status = 404;
      throw error;
    }

    // 2. Decrement sort of items that come after the deleted item
    await db.ChecklistItem.decrement("sort", {
      by: 1,
      where: {
        checklist_id: item.checklist_id,
        sort: { [db.Sequelize.Op.gt]: item.sort },
      },
      transaction,
    });

    // 3. Perform deletion
    await db.ChecklistItem.destroy({
      where: { checklist_item_id },
      transaction,
    });

    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    console.error("error in deleteChecklistItemService", error);
    throw error;
  }
}

/**
 * Updates a checklist item with validation and optional sort rebalancing.
 */
export async function updateChecklistItemService({
  builderId,
  checklist_item_id,
  checklist_id,
  description,
  notes,
  is_required,
  type,
  sort,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // 1. Verify item exists and belongs to the builder (via join with Checklist)
    const item = await db.ChecklistItem.findOne({
      where: { checklist_item_id },
      include: [
        {
          model: db.Checklist,
          as: "checklist",
          where: { builder_id: builderId, is_deleted: false },
          attributes: ["builder_id", "checklist_id"],
          required: true,
        },
      ],
      transaction,
    });

    if (!item) {
      const error = new Error("Checklist item not found.");
      error.status = 404;
      throw error;
    }

    let finalChecklistId = item.checklist_id;

    // 2. If checklist_id is being updated, verify ownership of the new checklist
    if (checklist_id && checklist_id !== item.checklist_id) {
      const newChecklist = await db.Checklist.findOne({
        where: {
          checklist_id,
          builder_id: builderId,
          is_deleted: false,
        },
        attributes: ["checklist_id"],
        transaction,
      });

      if (!newChecklist) {
        const error = new Error("Checklist does not belong to this builder.");
        error.status = 403;
        throw error;
      }
      finalChecklistId = checklist_id;
    }

    // 3. Duplicate description check
    const finalDescription = description !== undefined ? description.trim() : item.description;
    const duplicate = await db.ChecklistItem.findOne({
      where: {
        checklist_id: finalChecklistId,
        description: finalDescription,
        checklist_item_id: { [db.Sequelize.Op.ne]: checklist_item_id },
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("Description with this name already exists for this checklist.");
      error.status = 409;
      throw error;
    }

    // 4. Type validation
    if (type && !["checkbox", "dropdown"].includes(type)) {
      const error = new Error("Invalid type. Allowed: checkbox, dropdown.");
      error.status = 400;
      throw error;
    }

    // 5. Sort Rebalancing
    const existingSortOrder = item.sort;
    if (sort != null && sort !== existingSortOrder) {
      const maxSortResult = await db.ChecklistItem.max("sort", {
        where: { checklist_id: finalChecklistId },
        transaction,
      });
      const maxSortOrder = maxSortResult ?? 0;

      if (sort < 1 || sort > maxSortOrder + 1) {
        const error = new Error(`Invalid sort. Allowed range is 1 to ${maxSortOrder + 1}.`);
        error.status = 400;
        throw error;
      }

      // Perform shifting
      if (sort > existingSortOrder) {
        // Move down: decrement items in range (old, new]
        await db.ChecklistItem.decrement("sort", {
          by: 1,
          where: {
            checklist_id: finalChecklistId,
            sort: {
              [db.Sequelize.Op.gt]: existingSortOrder,
              [db.Sequelize.Op.lte]: sort,
            },
            checklist_item_id: { [db.Sequelize.Op.ne]: checklist_item_id },
          },
          transaction,
        });
      } else {
        // Move up: increment items in range [new, old)
        await db.ChecklistItem.increment("sort", {
          by: 1,
          where: {
            checklist_id: finalChecklistId,
            sort: {
              [db.Sequelize.Op.gte]: sort,
              [db.Sequelize.Op.lt]: existingSortOrder,
            },
            checklist_item_id: { [db.Sequelize.Op.ne]: checklist_item_id },
          },
          transaction,
        });
      }
    }

    // 6. Apply dynamic updates
    const updateData = {};
    if (checklist_id !== undefined) {
      updateData.checklist_id = checklist_id;
    }
    if (description !== undefined) {
      updateData.description = description.trim();
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    if (is_required !== undefined) {
      updateData.is_required = is_required;
    }
    if (type !== undefined) {
      updateData.type = type;
    }
    if (sort !== undefined) {
      updateData.sort = sort;
    }
    updateData.updatedAt = new Date();

    await item.update(updateData, { transaction });

    await transaction.commit();

    return item.get({ plain: true });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    console.error("error in updateChecklistItemService", error);
    throw error;
  }
}
