import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

export async function createSubChecklistService({
  construction_checklist_id,
  name,
  data_required,
  no_of_days,
  sort_order,
  builderId,
  companyId,
}) {
  const { ConstructionSubChecklist, ConstructionChecklist } = db;
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Validate Checklist Existence and Ownership ────────────────────────
    const checklist = await ConstructionChecklist.findOne({
      where: {
        construction_checklist_id,
        builder_id: builderId,
        company_id: companyId,
      },
      attributes: ["construction_checklist_id"],
      transaction,
    });

    if (!checklist) {
      const error = new Error("Invalid construction_checklist_id or access denied");
      error.status = 400;
      throw error;
    }

    // ── 2. Check for Duplicate Name ──────────────────────────────────────────
    const duplicate = await ConstructionSubChecklist.findOne({
      where: {
        name: name.trim(),
        construction_checklist_id,
      },
      attributes: ["construction_sub_checklist_id"],
      transaction,
    });

    if (duplicate) {
      const error = new Error("Sub-checklist name already exists for this checklist");
      error.status = 400;
      throw error;
    }

    // ── 3. Sort Order Logic ──────────────────────────────────────────────────
    const count = await ConstructionSubChecklist.count({
      where: { construction_checklist_id },
      transaction,
    });

    let newSortOrder;
    if (sort_order !== undefined) {
      // User entered a sort order - validate it
      if (sort_order < 1 || sort_order > count + 1) {
        const error = new Error(`Invalid sort order. User can enter only 1 to ${count + 1} sortOrder`);
        error.status = 400;
        throw error;
      }
      newSortOrder = sort_order;

      // Shift existing records down
      await ConstructionSubChecklist.update(
        { sort_order: db.sequelize.literal("sort_order + 1") },
        {
          where: {
            construction_checklist_id,
            sort_order: { [Op.gte]: newSortOrder },
          },
          transaction,
        },
      );
    } else {
      newSortOrder = count + 1;
    }

    // ── 4. Create Record ─────────────────────────────────────────────────────
    const newRecord = await ConstructionSubChecklist.create(
      {
        construction_checklist_id,
        name: name.trim(),
        data_required: data_required !== undefined ? data_required : true,
        no_of_days: no_of_days !== undefined ? no_of_days : 0,
        sort_order: newSortOrder,
      },
      { transaction },
    );

    await transaction.commit();

    return {
      construction_sub_checklist_id: newRecord.construction_sub_checklist_id,
      construction_checklist_id: newRecord.construction_checklist_id,
      name: newRecord.name,
      data_required: newRecord.data_required,
      no_of_days: newRecord.no_of_days,
      sort_order: newRecord.sort_order,
      created_at: null, // Parity requirement
      updated_at: null, // Parity requirement
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

export async function getAllSubChecklistsService({
  construction_checklist_id,
  data_required,
  no_of_days,
  builderId,
  companyId,
}) {
  const { ConstructionSubChecklist, ConstructionChecklist } = db;

  const whereClause = {};
  if (construction_checklist_id) whereClause.construction_checklist_id = construction_checklist_id;
  if (data_required !== undefined) whereClause.data_required = data_required === "true";
  if (no_of_days !== undefined) whereClause.no_of_days = parseInt(no_of_days, 10);

  const list = await ConstructionSubChecklist.findAll({
    where: whereClause,
    include: [
      {
        model: ConstructionChecklist,
        as: "constructionChecklist",
        attributes: [],
        where: { builder_id: builderId, company_id: companyId },
        required: true,
      },
    ],
    order: [
      ["sort_order", "ASC"],
      ["createdAt", "DESC"],
    ],
  });

  return list.map((item) => {
    const plain = item.toJSON();
    return {
      construction_sub_checklist_id: plain.construction_sub_checklist_id,
      construction_checklist_id: plain.construction_checklist_id,
      name: plain.name,
      data_required: plain.data_required,
      no_of_days: plain.no_of_days,
      sort_order: plain.sort_order,
      created_at: null,
      updated_at: null,
    };
  });
}

export async function getSubChecklistByIdService({
  construction_sub_checklist_id,
  builderId,
  companyId,
}) {
  const { ConstructionSubChecklist, ConstructionChecklist } = db;

  const record = await ConstructionSubChecklist.findOne({
    where: { construction_sub_checklist_id },
    include: [
      {
        model: ConstructionChecklist,
        as: "constructionChecklist",
        attributes: [],
        where: { builder_id: builderId, company_id: companyId },
        required: true,
      },
    ],
  });

  if (!record) {
    const error = new Error("Construction sub checklist not found or access denied.");
    error.status = 404;
    throw error;
  }

  const plain = record.toJSON();
  return {
    construction_sub_checklist_id: plain.construction_sub_checklist_id,
    construction_checklist_id: plain.construction_checklist_id,
    name: plain.name,
    data_required: plain.data_required,
    no_of_days: plain.no_of_days,
    sort_order: plain.sort_order,
    created_at: null,
    updated_at: null,
  };
}

export async function updateSubChecklistService({
  construction_sub_checklist_id,
  name,
  data_required,
  no_of_days,
  sort_order,
  builderId,
  companyId,
}) {
  const { ConstructionSubChecklist, ConstructionChecklist } = db;
  const transaction = await db.sequelize.transaction();

  try {
    const existing = await ConstructionSubChecklist.findOne({
      where: { construction_sub_checklist_id },
      include: [
        {
          model: ConstructionChecklist,
          as: "constructionChecklist",
          attributes: ["builder_id", "company_id"],
          required: true,
        },
      ],
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction sub checklist not found.");
      error.status = 404;
      throw error;
    }

    if (
      existing.constructionChecklist.builder_id !== builderId ||
      existing.constructionChecklist.company_id !== companyId
    ) {
      const error = new Error("Access denied - you can only update your own records.");
      error.status = 403;
      throw error;
    }

    const currentSortOrder = existing.sort_order;
    const checklistId = existing.construction_checklist_id;

    const updatePayload = {};

    if (name !== undefined) {
      if (!name) {
        const error = new Error("Name cannot be empty");
        error.status = 400;
        throw error;
      }

      const duplicate = await ConstructionSubChecklist.findOne({
        where: {
          name: name.trim(),
          construction_checklist_id: checklistId,
          construction_sub_checklist_id: { [Op.ne]: construction_sub_checklist_id },
        },
        attributes: ["construction_sub_checklist_id"],
        transaction,
      });

      if (duplicate) {
        const error = new Error("Sub-checklist name already exists for this checklist");
        error.status = 400;
        throw error;
      }
      updatePayload.name = name.trim();
    }

    if (data_required !== undefined) updatePayload.data_required = data_required;
    if (no_of_days !== undefined) updatePayload.no_of_days = no_of_days;

    if (sort_order !== undefined && sort_order !== currentSortOrder) {
      const count = await ConstructionSubChecklist.count({
        where: { construction_checklist_id: checklistId },
        transaction,
      });

      if (sort_order < 1 || sort_order > count) {
        const error = new Error(`Invalid sort order. Choose a value between 1 and ${count}`);
        error.status = 400;
        throw error;
      }

      if (sort_order < currentSortOrder) {
        await ConstructionSubChecklist.update(
          { sort_order: db.sequelize.literal("sort_order + 1") },
          {
            where: {
              construction_checklist_id: checklistId,
              sort_order: { [Op.gte]: sort_order, [Op.lt]: currentSortOrder },
            },
            transaction,
          },
        );
      } else {
        await ConstructionSubChecklist.update(
          { sort_order: db.sequelize.literal("sort_order - 1") },
          {
            where: {
              construction_checklist_id: checklistId,
              sort_order: { [Op.gt]: currentSortOrder, [Op.lte]: sort_order },
            },
            transaction,
          },
        );
      }
      updatePayload.sort_order = sort_order;
    }

    if (Object.keys(updatePayload).length === 0) {
      const error = new Error("At least one field is required for update.");
      error.status = 400;
      throw error;
    }

    await existing.update(updatePayload, { transaction });

    const updated = await ConstructionSubChecklist.findByPk(construction_sub_checklist_id, { transaction });
    await transaction.commit();

    const plain = updated.toJSON();
    return {
      construction_sub_checklist_id: plain.construction_sub_checklist_id,
      construction_checklist_id: plain.construction_checklist_id,
      name: plain.name,
      data_required: plain.data_required,
      no_of_days: plain.no_of_days,
      sort_order: plain.sort_order,
      created_at: null,
      updated_at: plain.updated_at,
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

export async function deleteSubChecklistService({
  construction_sub_checklist_id,
  builderId,
  companyId,
}) {
  const { ConstructionSubChecklist, ConstructionChecklist } = db;
  const transaction = await db.sequelize.transaction();

  try {
    const existing = await ConstructionSubChecklist.findOne({
      where: { construction_sub_checklist_id },
      include: [
        {
          model: ConstructionChecklist,
          as: "constructionChecklist",
          attributes: ["builder_id", "company_id"],
          required: true,
        },
      ],
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction sub checklist not found.");
      error.status = 404;
      throw error;
    }

    if (
      existing.constructionChecklist.builder_id !== builderId ||
      existing.constructionChecklist.company_id !== companyId
    ) {
      const error = new Error("Access denied - you can only delete your own records.");
      error.status = 403;
      throw error;
    }

    const deletedSortOrder = existing.sort_order;
    const checklistId = existing.construction_checklist_id;

    await existing.destroy({ transaction });

    await ConstructionSubChecklist.update(
      { sort_order: db.sequelize.literal("sort_order - 1") },
      {
        where: {
          construction_checklist_id: checklistId,
          sort_order: { [Op.gt]: deletedSortOrder },
        },
        transaction,
      },
    );

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}
