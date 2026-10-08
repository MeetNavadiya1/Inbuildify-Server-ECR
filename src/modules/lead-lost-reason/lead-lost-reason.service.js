import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

const DEFAULT_LEAD_LOST_REASONS = [
  { lost_reason: "Budget Constraints", sort_order: 1 },
  { lost_reason: "Went with Competitor", sort_order: 2 },
  { lost_reason: "Project Cancelled", sort_order: 3 },
  { lost_reason: "Unresponsive", sort_order: 4 },
  { lost_reason: "Timing", sort_order: 5 },
  { lost_reason: "Other", sort_order: 6 },
];

// ✅ CREATE
export const createLeadLostReasonService = async (payload, user) => {
  const { LeadLostReason, sequelize } = db;
  const { lost_reason, sort_order, is_active } = payload;

  return await sequelize.transaction(async (t) => {
    const duplicate = await LeadLostReason.findOne({
      where: {
        builder_id: user.builder_id,
        lost_reason: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("lost_reason")),
          lost_reason.toLowerCase(),
        ),
      },
      transaction: t,
    });

    if (duplicate) {
      const err = new Error("Lost reason already exists");
      err.statusCode = 400;
      throw err;
    }

    const maxSort = (await LeadLostReason.max("sort_order", {
      where: {
        [Op.or]: [
          { company_id: user.company_id },
          { builder_id: user.builder_id },
        ],
      },
      transaction: t,
    })) || 0;

    const finalSort = sort_order ?? 1;

    if (finalSort < 1 || finalSort > maxSort + 1) {
      const err = new Error(`sort_order must be between 1 and ${maxSort + 1}`);
      err.statusCode = 400;
      throw err;
    }

    await LeadLostReason.increment("sort_order", {
      by: 1,
      where: {
        sort_order: { [Op.gte]: finalSort },
        [Op.or]: [
          { company_id: user.company_id },
          { builder_id: user.builder_id },
        ],
      },
      transaction: t,
    });

    const created = await LeadLostReason.create(
      {
        company_id: user.company_id,
        builder_id: user.builder_id,
        lost_reason,
        sort_order: finalSort,
        is_active: is_active ?? true,
        created_by: user.user_id,
        updated_by: user.user_id,
      },
      { transaction: t },
    );

    return created.toJSON();
  });
};

// ✅ GET ALL
export const getAllLeadLostReasonService = async (user, page, limit) => {
  const { LeadLostReason } = db;

  const offset = (page - 1) * limit;

  // ── Auto-seed defaults if no rows exist ───────────────────────────────
  const existing = await LeadLostReason.findOne({
    where: { builder_id: user.builder_id },
    attributes: ["lead_lost_reason_id"],
  });

  if (!existing) {
    await LeadLostReason.bulkCreate(
      DEFAULT_LEAD_LOST_REASONS.map((row) => ({
        ...row,
        company_id: user.company_id,
        builder_id: user.builder_id,
        created_by: user.user_id,
        updated_by: user.user_id,
      })),
    );
  }
  // ────────────────────────────────────────────────────────────────────────

  const where = { builder_id: user.builder_id };
  if (user.company_id) {
    where[Op.and] = [{ [Op.or]: [{ company_id: user.company_id }, { company_id: null }] }];
  }

  const { count, rows } = await LeadLostReason.findAndCountAll({
    where,
    order: [["sort_order", "ASC"]],
    limit,
    offset,
  });

  return {
    data: rows.map((r) => r.toJSON()),
    total: count,
  };
};

// ✅ DELETE
export const deleteLeadLostReasonService = async (id, builderId) => {
  const { LeadLostReason, sequelize } = db;

  return await sequelize.transaction(async (t) => {
    const existing = await LeadLostReason.findOne({
      where: { lead_lost_reason_id: id, builder_id: builderId },
      transaction: t,
    });

    if (!existing) {
      const err = new Error("Lead lost reason not found");
      err.statusCode = 404;
      throw err;
    }

    const deletedSort = existing.sort_order;

    await existing.destroy({ transaction: t });

    await LeadLostReason.decrement("sort_order", {
      by: 1,
      where: {
        builder_id: builderId,
        sort_order: { [Op.gt]: deletedSort },
      },
      transaction: t,
    });

    return true;
  });
};

// ✅ UPDATE
export const updateLeadLostReasonService = async (id, payload, user) => {
  const { LeadLostReason, sequelize } = db;
  const { lost_reason, sort_order } = payload;

  return await sequelize.transaction(async (t) => {
    const existing = await LeadLostReason.findOne({
      where: {
        lead_lost_reason_id: id,
        company_id: user.company_id,
        builder_id: user.builder_id,
      },
      transaction: t,
    });

    if (!existing) {
      throw new Error("Lead lost reason not found");
    }
    if (!existing.is_active) {
      throw new Error("Inactive lead lost reason");
    }

    if (lost_reason) {
      const duplicate = await LeadLostReason.findOne({
        where: {
          company_id: user.company_id,
          builder_id: user.builder_id,
          lead_lost_reason_id: { [Op.ne]: id },
          lost_reason: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("lost_reason")),
            lost_reason.toLowerCase(),
          ),
        },
        transaction: t,
      });

      if (duplicate) {
        throw new Error("Lost reason already exists");
      }
    }
    if (sort_order !== undefined) {
      const maxSort =
        (await LeadLostReason.max("sort_order", {
          where: {
            [Op.or]: [
              { company_id: user.company_id },
              { builder_id: user.builder_id },
            ],
          },
          transaction: t,
        })) || 0;

      if (sort_order < 1 || sort_order > maxSort) {
        const err = new Error(`sort_order must be between 1 and ${maxSort}`);
        err.statusCode = 400;
        throw err;
      }

      const existingSort = existing.sort_order;

      if (sort_order !== existingSort) {
        if (sort_order > existingSort) {
          await LeadLostReason.decrement("sort_order", {
            by: 1,
            where: {
              builder_id: user.builder_id,
              lead_lost_reason_id: { [Op.ne]: id },
              sort_order: { [Op.gt]: existingSort, [Op.lte]: sort_order },
            },
            transaction: t,
          });
        } else {
          await LeadLostReason.increment("sort_order", {
            by: 1,
            where: {
              builder_id: user.builder_id,
              lead_lost_reason_id: { [Op.ne]: id },
              sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSort },
            },
            transaction: t,
          });
        }
      }
    }

    await existing.update(
      {
        ...(lost_reason !== undefined && { lost_reason }),
        ...(sort_order !== undefined && { sort_order }),
        updated_by: user.user_id,
      },
      { transaction: t },
    );

    return existing.toJSON();
  });
};

// ✅ UPDATE ACTIVE
export const updateLeadLostReasonActiveService = async (id, is_active, user) => {
  const { LeadLostReason } = db;

  const where = { lead_lost_reason_id: id, builder_id: user.builder_id };
  if (user.company_id) {
    where.company_id = user.company_id;
  }

  const existing = await LeadLostReason.findOne({
    where,
  });

  if (!existing) {
    throw new Error("Lead lost reason not found or you do not have permission to modify it");
  }

  await existing.update({
    is_active,
    updated_by: user.user_id,
  });

  return existing.toJSON();
};
