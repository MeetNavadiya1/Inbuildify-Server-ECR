import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

const RETURN_FIELDS = ["show_invoice_summary_in_pdf", "invoice_terms_days"];

function filterResponse(record) {
  const plain = record.get({ plain: true });
  return Object.fromEntries(RETURN_FIELDS.map((k) => [k, plain[k]]));
}

// ─── CREATE ─────────────────────────────

export async function createJobInvoiceSettingService(data, user) {
  const t = await db.sequelize.transaction();

  try {
    const { JobInvoiceSettings } = db;
    const { builder_id, company_id, user_id } = user;

    if (!builder_id || !company_id) {
      throw new Error("Unauthorized: Missing builder or company ID");
    }

    const duplicate = await JobInvoiceSettings.findOne({
      where: {
        [Op.or]: [{ builder_id }, { company_id }],
      },
      transaction: t,
    });

    if (duplicate) {
      throw new Error("Job invoice settings already exist");
    }

    const created = await JobInvoiceSettings.create(
      {
        company_id,
        builder_id,
        show_invoice_summary_in_pdf: data.show_invoice_summary_in_pdf ?? false,
        invoice_terms_days: data.invoice_terms_days || 0,
        created_by: user_id,
        updated_by: user_id,
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

// ─── UPDATE ─────────────────────────────

export async function updateJobInvoiceSettingService(data, user) {
  const t = await db.sequelize.transaction();

  try {
    const { JobInvoiceSettings } = db;
    const { builder_id, company_id, user_id } = user;

    if (!builder_id && !company_id) {
      throw new Error("Unauthorized: Missing builder or company ID");
    }

    if (
      data.show_invoice_summary_in_pdf === undefined &&
      data.invoice_terms_days === undefined
    ) {
      throw new Error("No valid fields provided for update");
    }

    const record = await JobInvoiceSettings.findOne({
      where: {
        [Op.or]: [{ builder_id }, { company_id }],
      },
      transaction: t,
    });

    if (!record) {
      throw new Error("Job invoice settings not found");
    }

    const updatePayload = {
      ...(data.show_invoice_summary_in_pdf !== undefined && {
        show_invoice_summary_in_pdf: data.show_invoice_summary_in_pdf,
      }),
      ...(data.invoice_terms_days !== undefined && {
        invoice_terms_days: data.invoice_terms_days,
      }),
      updated_by: user_id,
    };

    await record.update(updatePayload, { transaction: t });

    await t.commit();
    return filterResponse(record);

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─── GET ─────────────────────────────

export async function getJobInvoiceSettingService(user) {
  const { JobInvoiceSettings } = db;
  const { company_id, builder_id, user_id } = user;

  let record = await JobInvoiceSettings.findOne({
    where: { company_id, builder_id },
    attributes: RETURN_FIELDS,
  });

  if (!record) {
    await JobInvoiceSettings.create({
      company_id,
      builder_id,
      created_by: user_id,
      updated_by: user_id,
    });

    record = await JobInvoiceSettings.findOne({
      where: { company_id, builder_id },
      attributes: RETURN_FIELDS,
    });
  }

  return record.get({ plain: true });
}
