import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

/**
 * Validates commission value based on the unit.
 */
const validateCommissionValue = (unit, value) => {
  if (value === undefined || value === null) {
    throw { status: 400, message: "commission_value is required." };
  }

  const strVal = value.toString();
  const decimals = strVal.split(".")[1]?.length || 0;
  const digits = strVal.replace(".", "").length;

  if (unit === "percentage") {
    if (value > 100) throw { status: 400, message: "Percentage cannot exceed 100." };
    if (decimals > 2) throw { status: 400, message: "Percentage cannot have more than 2 decimals." };
    if (digits > 5) throw { status: 400, message: "Percentage exceeds precision limit (5,2)." };
  } else if (unit === "amount") {
    if (value > 99999999.99) throw { status: 400, message: "Amount cannot exceed 99999999.99 (precision 10,2)." };
    if (decimals > 2) throw { status: 400, message: "Amount cannot have more than 2 decimals." };
    if (digits > 10) throw { status: 400, message: "Amount exceeds precision limit (10,2)." };
  }
};

/**
 * Synchronizes the total commission in HLPackageCommissionMap.
 */
const syncTotalCommission = async (jobCommissionId, transaction) => {
  const { JobCommissionSubStage, HLPackageCommissionMap } = db;
  
  const total = await JobCommissionSubStage.sum("commission_value", {
    where: { job_commission_id: jobCommissionId },
    transaction,
  });

  await HLPackageCommissionMap.update(
    { total_commission: total || 0, updated_at: new Date() },
    { where: { job_commission_id: jobCommissionId }, transaction }
  );
};

/**
 * Creates a new job commission sub stage.
 */
export const createJobCommissionSubStageService = async (data, userContext) => {
  const { JobCommissionSubStage, JobCommission } = db;
  const { builderId, userId } = userContext;
  const {
    job_commission_id,
    name,
    commission_unit,
    commission_value,
    sort_order,
  } = data;

  return await db.sequelize.transaction(async (transaction) => {
    // 1. Verify ownership of job_commission_id
    const commission = await JobCommission.findOne({
      where: { job_commission_id, builder_id: builderId },
      transaction,
    });

    if (!commission) {
      throw { status: 400, message: "Invalid job_commission_id for this builder." };
    }

    // 2. Basic validations
    if (!commission_unit) throw { status: 400, message: "commission_unit is required." };
    if (!["percentage", "amount"].includes(commission_unit)) {
      throw { status: 400, message: "commission_unit must be 'percentage' or 'amount'." };
    }
    validateCommissionValue(commission_unit, commission_value);

    // 3. Sort Order Logic
    const maxSort = await JobCommissionSubStage.max("sort_order", {
      where: { job_commission_id },
      transaction,
    }) || 0;

    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      finalSortOrder = 1;
    }

    if (finalSortOrder < 1 || finalSortOrder > maxSort + 1) {
      throw { status: 400, message: `Invalid sort_order. Allowed range is 1 to ${maxSort + 1}.` };
    }

    // Shift existing sort orders
    await JobCommissionSubStage.increment("sort_order", {
      by: 1,
      where: {
        job_commission_id,
        sort_order: { [Op.gte]: finalSortOrder },
      },
      transaction,
    });

    // 4. Create
    const newStage = await JobCommissionSubStage.create(
      {
        job_commission_id,
        name,
        commission_unit,
        commission_value,
        sort_order: finalSortOrder,
        created_by: userId,
        updated_by: userId,
      },
      { transaction }
    );

    // 5. Sync total
    await syncTotalCommission(job_commission_id, transaction);

    return newStage.get({ plain: true });
  });
};

/**
 * Retrieves all job commission sub stages (with pagination).
 */
export const getAllJobCommissionSubStagesService = async (queryParams, userContext) => {
  const { JobCommissionSubStage, JobCommission } = db;
  const { builderId } = userContext;
  const { page = 1, limit = 25 } = queryParams;
  const offset = (page - 1) * limit;

  const { count, rows } = await JobCommissionSubStage.findAndCountAll({
    include: [
      {
        model: JobCommission,
        as: "jobCommission",
        where: { builder_id: builderId },
        attributes: ["name"],
      },
    ],
    order: [["sort_order", "ASC"]],
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  return {
    jobCommissionSubStage: rows.map((r) => {
      const plain = r.get({ plain: true });
      return {
        ...plain,
        job_commission_name: plain.jobCommission?.name || null,
      };
    }),
    total: count,
    totalPages: Math.ceil(count / limit),
    currentPage: parseInt(page),
    limit: parseInt(limit),
  };
};

/**
 * Retrieves sub stages by commission ID (with pagination).
 */
export const getJobCommissionSubStagesByCommissionIdService = async (jobCommissionId, queryParams, userContext) => {
  const { JobCommissionSubStage, JobCommission } = db;
  const { builderId } = userContext;
  const { page = 1, limit = 25 } = queryParams;
  const offset = (page - 1) * limit;

  // Verify ownership
  const commission = await JobCommission.findOne({
    where: { job_commission_id: jobCommissionId, builder_id: builderId },
  });
  if (!commission) {
    throw { status: 400, message: "Invalid job_commission_id for this builder." };
  }

  const { count, rows } = await JobCommissionSubStage.findAndCountAll({
    where: { job_commission_id: jobCommissionId },
    order: [["sort_order", "ASC"]],
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  return {
    records: rows.map((r) => r.get({ plain: true })),
    total: count,
    totalPages: Math.ceil(count / limit),
    currentPage: parseInt(page),
    limit: parseInt(limit),
  };
};

/**
 * Updates an existing job commission sub stage.
 */
export const updateJobCommissionSubStageService = async (id, data, userContext) => {
  const { JobCommissionSubStage, JobCommission } = db;
  const { builderId, userId } = userContext;
  const { name, commission_unit, commission_value, sort_order } = data;

  return await db.sequelize.transaction(async (transaction) => {
    // 1. Ownership check
    const existing = await JobCommissionSubStage.findOne({
      where: { job_commission_sub_stage_id: id },
      include: [{ model: JobCommission, as: "jobCommission", where: { builder_id: builderId } }],
      transaction,
    });

    if (!existing) {
      throw { status: 400, message: "Invalid job_commission_sub_stage_id for this builder." };
    }

    // 2. Validations
    if (name === undefined && commission_unit === undefined && commission_value === undefined && sort_order === undefined) {
      throw { status: 400, message: "No fields provided for update." };
    }

    const finalUnit = commission_unit || existing.commission_unit;
    if (commission_value !== undefined) {
      validateCommissionValue(finalUnit, commission_value);
    }

    // 3. Sort Order Management
    if (sort_order !== undefined && sort_order !== null) {
      const maxSort = await JobCommissionSubStage.max("sort_order", {
        where: { job_commission_id: existing.job_commission_id },
        transaction,
      });

      if (sort_order < 1 || sort_order > maxSort) {
        throw { status: 400, message: `Invalid sort_order. Allowed range is 1 to ${maxSort}.` };
      }

      if (sort_order !== existing.sort_order) {
        if (sort_order > existing.sort_order) {
          await JobCommissionSubStage.decrement("sort_order", {
            by: 1,
            where: {
              job_commission_id: existing.job_commission_id,
              sort_order: { [Op.gt]: existing.sort_order, [Op.lte]: sort_order },
              job_commission_sub_stage_id: { [Op.ne]: id },
            },
            transaction,
          });
        } else {
          await JobCommissionSubStage.increment("sort_order", {
            by: 1,
            where: {
              job_commission_id: existing.job_commission_id,
              sort_order: { [Op.gte]: sort_order, [Op.lt]: existing.sort_order },
              job_commission_sub_stage_id: { [Op.ne]: id },
            },
            transaction,
          });
        }
      }
    }

    // 4. Update
    await existing.update(
      {
        name: name !== undefined ? name : existing.name,
        commission_unit: commission_unit !== undefined ? commission_unit : existing.commission_unit,
        commission_value: commission_value !== undefined ? commission_value : existing.commission_value,
        sort_order: sort_order !== undefined ? sort_order : existing.sort_order,
        updated_by: userId,
        updated_at: new Date(),
      },
      { transaction }
    );

    // 5. Sync total
    await syncTotalCommission(existing.job_commission_id, transaction);

    // Return specific parity fields
    const updated = existing.get({ plain: true });
    return {
      jobCommissionSubStageId: updated.job_commission_sub_stage_id,
      name: updated.name,
      commissionUnit: updated.commission_unit,
      commissionValue: updated.commission_value,
      sortOrder: updated.sort_order,
      updatedAt: updated.updated_at,
    };
  });
};

/**
 * Deletes a job commission sub stage.
 */
export const deleteJobCommissionSubStageService = async (id, userContext) => {
  const { JobCommissionSubStage, JobCommission } = db;
  const { builderId } = userContext;

  return await db.sequelize.transaction(async (transaction) => {
    // 1. Ownership check
    const existing = await JobCommissionSubStage.findOne({
      where: { job_commission_sub_stage_id: id },
      include: [{ model: JobCommission, as: "jobCommission", where: { builder_id: builderId } }],
      transaction,
    });

    if (!existing) {
      throw { status: 400, message: "Invalid job_commission_sub_stage_id for this builder." };
    }

    const { sort_order: deletedSortOrder, job_commission_id } = existing;

    // 2. Delete
    await existing.destroy({ transaction });

    // 3. Rebalance Sort Order
    await JobCommissionSubStage.decrement("sort_order", {
      by: 1,
      where: {
        job_commission_id,
        sort_order: { [Op.gt]: deletedSortOrder },
      },
      transaction,
    });

    // 4. Sync Total
    await syncTotalCommission(job_commission_id, transaction);

    return null;
  });
};

export default {
  createJobCommissionSubStageService,
  getAllJobCommissionSubStagesService,
  getJobCommissionSubStagesByCommissionIdService,
  updateJobCommissionSubStageService,
  deleteJobCommissionSubStageService,
};
