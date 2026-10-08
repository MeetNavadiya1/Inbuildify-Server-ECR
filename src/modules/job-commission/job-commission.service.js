import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

// ─── HELPERS ─────────────────────────────

async function getCommissionSettings(builderId, t) {
  const { JobCommissionSettings } = db;
  return JobCommissionSettings.findOne({
    where: { builder_id: builderId },
    transaction: t,
  });
}

async function validateRecipientUser(userId, t) {
  if (!userId) {
    return true;
  }

  const { Users } = db;
  const user = await Users.findOne({
    where: { users_id: userId, is_deleted: false },
    transaction: t,
  });

  return !!user;
}

async function getMaxSortOrder(settingsId, type, t) {
  const { JobCommission } = db;
  const max = await JobCommission.max("sort_order", {
    where: {
      job_commission_settings_id: settingsId,
      commission_type: type,
    },
    transaction: t,
  });
  return max || 0;
}

// ─── CREATE ─────────────────────────────

export async function createJobCommissionService(data, user) {
  const t = await db.sequelize.transaction();

  try {
    const { JobCommission } = db;
    const { builder_id, company_id, users_id } = user;

    const settings = await getCommissionSettings(builder_id, t);
    if (!settings) {
      throw new Error("No commission settings found");
    }

    if (
      (data.commission_type === "outgoing" && !settings.define_outgoing_commission) ||
      (data.commission_type === "incoming" && !settings.define_incoming_commission)
    ) {
      throw new Error("Commission type not allowed");
    }

    if (data.recipient_user_id) {
      const valid = await validateRecipientUser(data.recipient_user_id, t);
      if (!valid) {
        throw new Error("Invalid recipient user");
      }
    }

    const settingsId = settings.job_commission_settings_id;
    const finalSortOrder = data.sort_order ?? 1;

    const maxSort = await getMaxSortOrder(settingsId, data.commission_type, t);

    if (finalSortOrder < 1 || finalSortOrder > maxSort + 1) {
      throw new Error(`Sort order must be between 1 and ${maxSort + 1}`);
    }

    // shift
    await JobCommission.increment("sort_order", {
      by: 1,
      where: {
        sort_order: { [Op.gte]: finalSortOrder },
        job_commission_settings_id: settingsId,
        commission_type: data.commission_type,
      },
      transaction: t,
    });

    const created = await JobCommission.create(
      {
        ...data,
        company_id,
        builder_id,
        job_commission_settings_id: settingsId,
        created_by: users_id,
        updated_by: users_id,
      },
      { transaction: t },
    );

    await t.commit();
    return created.get({ plain: true });

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─── GET ALL ─────────────────────────────

export async function getAllJobCommissionsService(user, query) {
  const { JobCommission } = db;

  const builderId = user?.builder_id;
  let { page = 1, limit = 25, commission_type } = query;

  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  const where = { builder_id: builderId };
  if (commission_type) {
    where.commission_type = commission_type;
  }

  const { count, rows } = await JobCommission.findAndCountAll({
    where,
    order: [["sort_order", "ASC"]],
    limit,
    offset,
  });

  return {
    data: rows.map((r) => r.get({ plain: true })),
    pagination: {
      totalRecords: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      pageSize: limit,
    },
  };
}

// ─── DELETE ─────────────────────────────

export async function deleteJobCommissionService(id, user) {
  const t = await db.sequelize.transaction();

  try {
    const { JobCommission, JobCommissionSubStage } = db;
    const builderId = user?.builder_id;

    const record = await JobCommission.findOne({
      where: { job_commission_id: id, builder_id: builderId },
      transaction: t,
    });

    if (!record) {
      throw new Error("Not found");
    }

    const { sort_order, commission_type, job_commission_settings_id } = record;

    await JobCommissionSubStage.destroy({
      where: { job_commission_id: id },
      transaction: t,
    });

    await record.destroy({ transaction: t });

    await JobCommission.decrement("sort_order", {
      by: 1,
      where: {
        sort_order: { [Op.gt]: sort_order },
        job_commission_settings_id,
        commission_type,
      },
      transaction: t,
    });

    await t.commit();

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─── UPDATE ─────────────────────────────

export async function updateJobCommissionService(id, data, user) {
  const t = await db.sequelize.transaction();

  try {
    const { JobCommission } = db;
    const { builder_id, users_id } = user;

    const record = await JobCommission.findOne({
      where: { job_commission_id: id, builder_id },
      transaction: t,
    });

    if (!record) {
      throw new Error("Not found");
    }

    await record.update(
      {
        ...data,
        updated_by: users_id,
      },
      { transaction: t },
    );

    await t.commit();

    return record.get({ plain: true });

  } catch (err) {
    await t.rollback();
    throw err;
  }
}
