import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

export async function createGeneralSettingService({
  companyId,
  builderId,
  notification_referral_partner,
  pdf_password_protected,
  pdf_password,
  round_of_cost,
  negative_value_show,
  negative_value_color,
  show_reference_id_in_pdf,
  job_id_label,
  editable_pdf_types,
  non_editable_document_types,
}) {
  const existingSettings = await db.GeneralSettings.findOne({
    where: { company_id: companyId, builder_id: builderId },
  });

  if (existingSettings) {
    const error = new Error(
      "General settings already exist for this company and builder.",
    );
    error.status = 400;
    throw error;
  }

  let finalPassword = null;
  if (pdf_password_protected === true) {
    if (!pdf_password) {
      const error = new Error(
        "PDF password is required when password protection is enabled.",
      );
      error.status = 400;
      throw error;
    }
    finalPassword = pdf_password;
  }

  const newSettings = await db.GeneralSettings.create({
    company_id: companyId,
    builder_id: builderId,
    notification_referral_partner: notification_referral_partner || false,
    pdf_password_protected: pdf_password_protected || false,
    pdf_password: finalPassword,
    round_of_cost: round_of_cost || false,
    negative_value_show: negative_value_show || false,
    negative_value_color: negative_value_color || null,
    show_reference_id_in_pdf: show_reference_id_in_pdf || null,
    job_id_label: job_id_label || null,
    editable_pdf_types: editable_pdf_types || [],
    non_editable_document_types: non_editable_document_types || [],
  });

  return keysToCamelCase(newSettings.toJSON());
}

export async function updateGeneralSettingsService({
  builderId,
  companyId,
  notification_referral_partner,
  pdf_password_protected,
  pdf_password,
  round_of_cost,
  negative_value_show,
  negative_value_color,
  show_reference_id_in_pdf,
  job_id_label,
  editable_pdf_types,
  non_editable_document_types,
}) {
  // At least one field must be provided
  if (
    notification_referral_partner === undefined &&
    pdf_password_protected === undefined &&
    pdf_password === undefined &&
    round_of_cost === undefined &&
    negative_value_show === undefined &&
    negative_value_color === undefined &&
    show_reference_id_in_pdf === undefined &&
    job_id_label === undefined &&
    editable_pdf_types === undefined &&
    non_editable_document_types === undefined
  ) {
    const error = new Error("At least one field must be provided for update.");
    error.status = 400;
    throw error;
  }

  // Fetch existing record
  const existing = await db.GeneralSettings.findOne({
    where: { builder_id: builderId },
  });

  if (!existing) {
    const error = new Error("General setting not found.");
    error.status = 404;
    throw error;
  }

  const currentProtection = existing.pdf_password_protected;
  const finalProtection =
    pdf_password_protected !== undefined ? pdf_password_protected : currentProtection;

  // Cannot set password when protection is disabled
  if (finalProtection === false && pdf_password !== undefined) {
    const error = new Error(
      "Cannot update or define PDF password when password protection is disabled.",
    );
    error.status = 400;
    throw error;
  }

  // Build update payload
  const updatePayload = {};

  if (notification_referral_partner !== undefined) {
    updatePayload.notification_referral_partner = notification_referral_partner;
  }

  if (pdf_password_protected !== undefined) {
    updatePayload.pdf_password_protected = pdf_password_protected;
  }

  if (finalProtection === true && pdf_password !== undefined) {
    updatePayload.pdf_password = pdf_password;
  }

  // Clear password if protection is being turned off
  if (currentProtection === true && finalProtection === false) {
    updatePayload.pdf_password = null;
  }

  if (round_of_cost !== undefined) {
    updatePayload.round_of_cost = round_of_cost;
  }

  if (negative_value_show !== undefined) {
    updatePayload.negative_value_show = negative_value_show;
  }

  if (negative_value_color !== undefined) {
    updatePayload.negative_value_color = negative_value_color;
  }

  if (show_reference_id_in_pdf !== undefined) {
    updatePayload.show_reference_id_in_pdf = show_reference_id_in_pdf;
  }

  if (job_id_label !== undefined) {
    updatePayload.job_id_label = job_id_label;
  }

  if (editable_pdf_types !== undefined) {
    updatePayload.editable_pdf_types = editable_pdf_types;
  }

  // An empty array is a real value here — it means "nothing is blocked", which
  // is how an administrator turns every type back on. Only `undefined` means
  // "not sent", which is why this is not a truthiness check.
  if (non_editable_document_types !== undefined) {
    updatePayload.non_editable_document_types = non_editable_document_types;
  }

  updatePayload.company_id = companyId;

  await existing.update(updatePayload);

  return keysToCamelCase(existing.toJSON());
}

export async function getUserGeneralSettingsService({ company_id, builder_id }) {
  //find the generalsetting first
  let settings = await db.GeneralSettings.findOne({
    where: { company_id, builder_id },
  });

  // If not found, create with defaults
  if (!settings) {
    settings = await db.GeneralSettings.create({ company_id, builder_id });
  }

  return keysToCamelCase(settings.toJSON());
}
