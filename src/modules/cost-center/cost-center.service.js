import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";

/**
 * CREATE COST CENTER
 */
export async function createCostCenter(payload, builderId, companyId, userId) {
  const { CostCenter, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  if (!companyId && !builderId) {
    const error = new Error(
      "User context is invalid: either companyId or builderId must be provided",
    );
    error.status = 401;
    throw error;
  }

  const transaction = await sequelize.transaction();
  try {
    const orClause = {
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    };

    // 1. Duplicate Code Check
    const duplicate = await CostCenter.findOne({
      where: {
        ...orClause,
        code: payload.code,
        is_sample_data: false,
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error(`Cost center with code ${payload.code} already exists`);
      error.status = 400;
      throw error;
    }

    // 2. Resolve and validate sortOrder
    const maxSortOrder = await CostCenter.max("sort_order", {
      where: { ...orClause },
      transaction,
    });

    const max = maxSortOrder ?? 0;
    let sort_order = payload.sortOrder !== undefined ? payload.sortOrder : payload.sort_order;

    if (sort_order == null) {
      sort_order = max + 1;
    }

    if (sort_order < 1 || sort_order > max + 1) {
      const error = new Error(`Invalid sort_order. Allowed range is 1 to ${max + 1}.`);
      error.status = 400;
      throw error;
    }

    // 3. Shift sort_order to make room
    if (sort_order <= max) {
      await CostCenter.increment("sort_order", {
        by: 1,
        where: {
          sort_order: { [Op.gte]: sort_order },
          ...orClause,
        },
        transaction,
      });
    }

    // 4. Creation
    const costCenter = await CostCenter.create(
      {
        company_id: companyId,
        builder_id: builderId,
        code: payload.code,
        name: payload.name,
        description: payload.description || null,
        sort_order,
        status: payload.status !== undefined ? payload.status : true,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();
    return keysToCamelCase(costCenter.get({ plain: true }));
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * GET ALL COST CENTERS
 */
export async function getCostCenters(builderId, companyId, filters = {}) {
  const { CostCenter, Sequelize } = db;
  const { Op } = Sequelize;

  const where = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  if (filters.code) {
    where.code = { [Op.iLike]: `%${filters.code}%` };
  }

  if (filters.name) {
    where.name = { [Op.iLike]: `%${filters.name}%` };
  }

  if (filters.description) {
    where.description = { [Op.iLike]: `%${filters.description}%` };
  }

  const sortOrder = filters.sortOrder !== undefined ? filters.sortOrder : filters.sort_order;
  if (sortOrder !== undefined) {
    where.sort_order = sortOrder;
  }

  if (filters.status !== undefined) {
    where.status = filters.status;
  }

  const rows = await CostCenter.findAll({
    where,
    order: [["sort_order", "ASC"]],
  });

  return keysToCamelCase(rows.map((row) => row.toJSON()));
}

/**
 * GET COST CENTER BY ID
 */
//not used anywhere
export async function getCostCenterById(costCenterId, builderId, companyId) {
  const { CostCenter, Sequelize } = db;
  const { Op } = Sequelize;

  const record = await CostCenter.findOne({
    where: {
      cost_center_id: costCenterId,
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    },
  });

  if (!record) {
    throw new Error("Cost center not found");
  }

  return keysToCamelCase(record.get({ plain: true }));
}

/**
 * UPDATE COST CENTER
 */
export async function updateCostCenter(
  costCenterId,
  payload,
  builderId,
  companyId,
  userId,
) {
  const { CostCenter, CostCenterChecklistMap, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  const transaction = await sequelize.transaction();
  try {
    const orClause = {
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    };

    // 1. Check existence
    const existing = await CostCenter.findOne({
      where: {
        cost_center_id: costCenterId,
        ...orClause,
      },
      transaction,
    });

    if (!existing) {
      throw new Error("Cost center not found.");
    }

    // 2. Duplicate Code Check
    if (payload.code && payload.code !== existing.code) {
      const duplicate = await CostCenter.findOne({
        where: {
          ...orClause,
          code: payload.code,
          is_sample_data: false,
          cost_center_id: { [Op.ne]: costCenterId },
        },
        transaction,
      });

      if (duplicate) {
        throw new Error(`Cost center with code ${payload.code} already exists`);
      }
    }

    // 3. Validate and reorder sort_order if changed
    const sort_order = payload.sortOrder !== undefined ? payload.sortOrder : payload.sort_order;

    if (sort_order !== undefined && sort_order !== null) {
      const maxSortOrderResult = await CostCenter.max("sort_order", {
        where: { ...orClause },
        transaction,
      });

      const max = maxSortOrderResult ?? 0;

      if (sort_order < 1 || sort_order > max) {
        throw new Error(`Invalid sort_order. Allowed range is 1 to ${max}.`);
      }

      const existingSortOrder = existing.sort_order;

      if (sort_order !== existingSortOrder) {
        if (sort_order > existingSortOrder) {
          // Moving down — shift records between old and new position up
          await CostCenter.increment("sort_order", {
            by: -1,
            where: {
              sort_order: {
                [Op.gt]: existingSortOrder,
                [Op.lte]: sort_order,
              },
              cost_center_id: { [Op.ne]: costCenterId },
              ...orClause,
            },
            transaction,
          });
        } else {
          // Moving up — shift records between new and old position down
          await CostCenter.increment("sort_order", {
            by: 1,
            where: {
              sort_order: {
                [Op.gte]: sort_order,
                [Op.lt]: existingSortOrder,
              },
              cost_center_id: { [Op.ne]: costCenterId },
              ...orClause,
            },
            transaction,
          });
        }
      }
    }

    // 4. Update the record
    const updatedData = {
      code: payload.code !== undefined ? payload.code : existing.code,
      name: payload.name !== undefined ? payload.name : existing.name,
      description: payload.description !== undefined ? payload.description : existing.description,
      sort_order: sort_order !== undefined ? sort_order : existing.sort_order,
      status: payload.status !== undefined ? payload.status : existing.status,
      updated_by: userId,
    };

    await existing.update(updatedData, { transaction });

    // 5. Cleanup checklist maps if deactivated
    if (payload.status === false) {
      await CostCenterChecklistMap.destroy({
        where: { cost_center_id: costCenterId },
        transaction,
      });
    }

    await transaction.commit();
    return keysToCamelCase(existing.get({ plain: true }));
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * DELETE COST CENTER
 */
/**
 * DELETE COST CENTER
 */
export async function deleteCostCenter(costCenterId, builderId, companyId) {
  const { CostCenter, ConstructionChecklist, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  const transaction = await sequelize.transaction();
  try {
    const orClause = {
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    };

    // 1. Check existence
    const existing = await CostCenter.findOne({
      where: {
        cost_center_id: costCenterId,
        ...orClause,
      },
      transaction,
    });

    if (!existing) {
      throw new Error("Cost center not found");
    }

    const existingSortOrder = existing.sort_order;

    // 2. Remove cost_center_id from construction_checklist array field
    await ConstructionChecklist.update(
      {
        cost_center_id: sequelize.fn(
          "array_remove",
          sequelize.col("cost_center_id"),
          costCenterId,
        ),
      },
      {
        where: {
          cost_center_id: { [Op.contains]: [costCenterId] },
          ...orClause,
        },
        transaction,
      },
    );

    // 3. Rebalance sort_order
    await CostCenter.increment("sort_order", {
      by: -1,
      where: {
        sort_order: { [Op.gt]: existingSortOrder },
        ...orClause,
      },
      transaction,
    });

    // 4. Delete the record
    await existing.destroy({ transaction });

    await transaction.commit();
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * TOGGLE COST CENTER STATUS
 */
//not used anywhere
export async function toggleCostCenterStatus(
  costCenterId,
  builderId,
  companyId,
  userId,
) {
  const { CostCenter, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  const transaction = await sequelize.transaction();
  try {
    const existing = await CostCenter.findOne({
      where: {
        cost_center_id: costCenterId,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
      transaction,
    });

    if (!existing) {
      throw new Error("Cost center not found");
    }

    const newStatus = !existing.status;

    await existing.update(
      {
        status: newStatus,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();
    return keysToCamelCase(existing.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * CREATE COST CENTER CHECKLIST MAP
 */

/**
 * CREATE COST CENTER CHECKLIST MAP
 */
export async function createCostCenterChecklistMapService(
  payload,
  builderId,
  companyId,
) {
  const { CostCenter, ConstructionChecklist, CostCenterChecklistMap } = db;
  const transaction = await db.sequelize.transaction();

  try {
    // 1. Validate cost center exists and belongs to user
    const costCenter = await CostCenter.findOne({
      where: {
        cost_center_id: payload.cost_center_id,
        [db.Sequelize.Op.or]: [
          { company_id: companyId },
          { builder_id: builderId },
        ],
      },
      transaction,
    });

    if (!costCenter) {
      const error = new Error("Cost center not found or does not belong to your organization");
      error.status = 404;
      throw error;
    }

    // 2. Validate construction checklist exists and belongs to user
    const checklist = await ConstructionChecklist.findOne({
      where: {
        construction_checklist_id: payload.construction_checklist_id,
        [db.Sequelize.Op.or]: [
          { company_id: companyId },
          { builder_id: builderId },
        ],
      },
      transaction,
    });

    if (!checklist) {
      const error = new Error("Construction checklist not found or does not belong to your organization");
      error.status = 404;
      throw error;
    }

    // 3. Check for duplicate mapping
    const duplicate = await CostCenterChecklistMap.findOne({
      where: {
        cost_center_id: payload.cost_center_id,
        construction_checklist_id: payload.construction_checklist_id,
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("This cost center is already mapped to this construction checklist");
      error.status = 400;
      throw error;
    }

    // 4. Create mapping
    const mapping = await CostCenterChecklistMap.create(
      {
        cost_center_id: payload.cost_center_id,
        construction_checklist_id: payload.construction_checklist_id,
      },
      { transaction },
    );

    await transaction.commit();

    return {
      id: mapping.id,
      costCenterId: mapping.cost_center_id,
      constructionChecklistId: mapping.construction_checklist_id,
      createdAt: null, // Parity requirement
      // Seeded demo record — badged in the UI, and left out of the pickers on a
      // "create new" form (Settings → Sample Data clears it).
      isSampleData: mapping.is_sample_data === true,
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

/**
 * GET ALL COST CENTER CHECKLIST MAPS
 */
export async function getCostCenterChecklistMapsService(builderId, companyId, filters = {}) {
  const { CostCenter, ConstructionChecklist, CostCenterChecklistMap } = db;

  const whereClause = {
    [db.Sequelize.Op.or]: [
      { "$costCenter.company_id$": companyId },
      { "$costCenter.builder_id$": builderId },
    ],
  };

  if (filters.cost_center_id) {
    whereClause.cost_center_id = filters.cost_center_id;
  }

  if (filters.construction_checklist_id) {
    whereClause.construction_checklist_id = filters.construction_checklist_id;
  }

  const rows = await CostCenterChecklistMap.findAll({
    where: whereClause,
    include: [
      {
        model: CostCenter,
        as: "costCenter",
        attributes: ["sort_order"],
        required: true,
      },
      {
        model: ConstructionChecklist,
        as: "constructionChecklist",
        attributes: ["sort_order"],
        required: true,
      },
    ],
    order: [
      [{ model: CostCenter, as: "costCenter" }, "sort_order", "ASC"],
      [{ model: ConstructionChecklist, as: "constructionChecklist" }, "sort_order", "ASC"],
      ["createdAt", "DESC"],
    ],
  });

  return rows.map((row) => ({
    id: row.id,
    costCenterId: row.cost_center_id,
    constructionChecklistId: row.construction_checklist_id,
    createdAt: row.createdAt,
    // Seeded demo record — badged in the UI, and left out of the pickers on a
    // "create new" form (Settings → Sample Data clears it).
    isSampleData: row.is_sample_data === true,
  }));
}

/**
 * DELETE COST CENTER CHECKLIST MAP
 */
export async function deleteCostCenterChecklistMapService(id, builderId, companyId) {
  const { CostCenter, ConstructionChecklist, CostCenterChecklistMap } = db;
  const transaction = await db.sequelize.transaction();

  try {
    // Verify the mapping exists and belongs to user's organization
    const existing = await CostCenterChecklistMap.findOne({
      where: { id },
      include: [
        {
          model: CostCenter,
          as: "costCenter",
          where: {
            [db.Sequelize.Op.or]: [
              { company_id: companyId },
              { builder_id: builderId },
            ],
          },
          required: true,
        },
        {
          model: ConstructionChecklist,
          as: "constructionChecklist",
          where: {
            [db.Sequelize.Op.or]: [
              { company_id: companyId },
              { builder_id: builderId },
            ],
          },
          required: true,
        },
      ],
      transaction,
    });

    if (!existing) {
      const error = new Error("Cost center checklist mapping not found or does not belong to your organization");
      error.status = 404;
      throw error;
    }

    await existing.destroy({ transaction });
    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

export default {
  createCostCenter,
  getCostCenters,
  getCostCenterById,
  updateCostCenter,
  deleteCostCenter,
  toggleCostCenterStatus,
  createCostCenterChecklistMapService,
  getCostCenterChecklistMapsService,
  deleteCostCenterChecklistMapService,
};
