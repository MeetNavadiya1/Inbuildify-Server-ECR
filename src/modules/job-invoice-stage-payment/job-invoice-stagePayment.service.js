import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

const RETURN_FIELDS = [
  "job_invoice_stage_payment_id",
  "job_invoice_settings_id",
  "description",
  "percentage",
  "method",
  "sort_order",
  "createdAt",
  "updatedAt",
];

/** The building contract's two payment methods. */
export const STAGE_METHODS = ["method1", "method2"];
const DEFAULT_METHOD = "method1";

// ─── Helpers ─────────────────────────────

async function getInvoiceSettings(builderId, transaction) {
  const { JobInvoiceSettings } = db;
  return JobInvoiceSettings.findOne({
    where: { builder_id: builderId },
    attributes: ["job_invoice_settings_id"],
    transaction,
  });
}

// Each method is its own sequence, so the ceiling is per method — otherwise
// adding the first Method 2 stage would have to sit after every Method 1 one.
async function getMaxSortOrder(settingsId, method, transaction) {
  const { JobInvoiceStagePayments } = db;
  const max = await JobInvoiceStagePayments.max("sort_order", {
    where: { job_invoice_settings_id: settingsId, method },
    transaction,
  });
  return max || 0;
}

async function findStagePayment(stagePaymentId, builderId, transaction) {
  const { JobInvoiceStagePayments, JobInvoiceSettings } = db;

  return JobInvoiceStagePayments.findOne({
    where: { job_invoice_stage_payment_id: stagePaymentId },
    include: [
      {
        model: JobInvoiceSettings,
        as: "jobInvoiceSettings",
        where: { builder_id: builderId },
        attributes: [],
      },
    ],
    transaction,
  });
}

function filterResponse(record) {
  const plain = record.get({ plain: true });
  return Object.fromEntries(RETURN_FIELDS.map((k) => [k, plain[k]]));
}

// ─── CREATE ─────────────────────────────

export async function createStagePaymentService(data, user) {
  const t = await db.sequelize.transaction();

  try {
    const { JobInvoiceStagePayments } = db;
    const { builder_id } = user;

    if (!builder_id) {
      throw new Error("Unauthorized");
    }

    if (data.percentage < 0 || data.percentage > 100) {
      throw new Error("Percentage must be between 0 and 100");
    }

    const settings = await getInvoiceSettings(builder_id, t);
    if (!settings) {
      throw new Error("Invoice settings not found");
    }

    const settingsId = settings.job_invoice_settings_id;
    const method = data.method ?? DEFAULT_METHOD;

    const finalSort = data.sort_order ?? 1;
    const maxSort = await getMaxSortOrder(settingsId, method, t);

    if (finalSort < 1 || finalSort > maxSort + 1) {
      throw new Error(`Sort order must be between 1 and ${maxSort + 1}`);
    }

    await JobInvoiceStagePayments.increment("sort_order", {
      by: 1,
      where: {
        sort_order: { [Op.gte]: finalSort },
        job_invoice_settings_id: settingsId,
        method,
      },
      transaction: t,
    });

    const created = await JobInvoiceStagePayments.create(
      {
        job_invoice_settings_id: settingsId,
        description: data.description.trim(),
        percentage: data.percentage || 0,
        method,
        sort_order: finalSort,
      },
      { transaction: t },
    );

    await t.commit();
    return filterResponse(created);

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─── GET ALL ─────────────────────────────

export async function getAllStagePaymentService(query, user) {
  const { JobInvoiceStagePayments, JobInvoiceSettings } = db;
  const { builder_id } = user;

  if (!builder_id) {
    throw new Error("Unauthorized");
  }

  let { page = 1, limit = 25, method } = query;
  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  const { count, rows } = await JobInvoiceStagePayments.findAndCountAll({
    attributes: RETURN_FIELDS,
    // Omitting `method` returns both schedules, so an existing caller that has
    // not been told about methods yet still sees everything.
    where: method ? { method } : undefined,
    include: [
      {
        model: JobInvoiceSettings,
        as: "jobInvoiceSettings",
        where: { builder_id },
        attributes: [],
      },
    ],
    order: [
      ["method", "ASC"],
      ["sort_order", "ASC"],
    ],
    limit,
    offset,
  });

  return {
    data: rows.map((r) => r.get({ plain: true })),
    pagination: {
      totalRecords: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      limit,
    },
  };
}

// ─── DELETE ─────────────────────────────

export async function deleteStagePaymentService(id, user) {
  const t = await db.sequelize.transaction();

  try {
    const { JobInvoiceStagePayments } = db;
    const { builder_id } = user;

    if (!builder_id) {
      throw new Error("Unauthorized");
    }

    const record = await findStagePayment(id, builder_id, t);
    if (!record) {
      throw new Error("Not found");
    }

    const { sort_order, job_invoice_settings_id, method } = record;

    await record.destroy({ transaction: t });

    // Close the gap within this method only — the other schedule's numbering is
    // independent and must not shift.
    await JobInvoiceStagePayments.decrement("sort_order", {
      by: 1,
      where: {
        sort_order: { [Op.gt]: sort_order },
        job_invoice_settings_id,
        method,
      },
      transaction: t,
    });

    await t.commit();
    return true;

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─── UPDATE ─────────────────────────────

export async function updateStagePaymentService(id, data, user) {
  const t = await db.sequelize.transaction();

  try {
    const { JobInvoiceStagePayments } = db;
    const { builder_id } = user;

    if (!builder_id) {
      throw new Error("Unauthorized");
    }

    const record = await findStagePayment(id, builder_id, t);
    if (!record) {
      throw new Error("Not found");
    }

    const { job_invoice_settings_id, sort_order: oldSort, method } = record;

    // A stage stays in the method it was created under; moving one between
    // schedules would renumber both, and the settings screen edits one at a time.
    if (data.method !== undefined && data.method !== method) {
      throw new Error("A stage cannot be moved between payment methods");
    }

    const finalSort = data.sort_order;

    if (finalSort !== undefined) {
      const maxSort = await getMaxSortOrder(job_invoice_settings_id, method, t);

      if (finalSort < 1 || finalSort > maxSort) {
        throw new Error(`Sort must be between 1 and ${maxSort}`);
      }

      if (finalSort !== oldSort) {
        if (finalSort > oldSort) {
          await JobInvoiceStagePayments.decrement("sort_order", {
            by: 1,
            where: {
              sort_order: { [Op.gt]: oldSort, [Op.lte]: finalSort },
              job_invoice_settings_id,
              method,
            },
            transaction: t,
          });
        } else {
          await JobInvoiceStagePayments.increment("sort_order", {
            by: 1,
            where: {
              sort_order: { [Op.gte]: finalSort, [Op.lt]: oldSort },
              job_invoice_settings_id,
              method,
            },
            transaction: t,
          });
        }
      }
    }

    await record.update(
      {
        ...(data.description !== undefined && { description: data.description }),
        ...(data.percentage !== undefined && { percentage: data.percentage }),
        ...(finalSort !== undefined && { sort_order: finalSort }),
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
