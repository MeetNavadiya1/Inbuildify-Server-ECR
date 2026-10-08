import db from "../../config/database/models/postgre-models/index.js";

// ─── DTO mappers ─────────────────────────────────────────────────────────────
// The frontend interfaces expect `id` (not `siteCheckinFieldId`) plus camelCase
// keys. We map explicitly here so both the authenticated and public endpoints
// emit the exact same shape — otherwise the builder-side detail drawer, which
// looks responses up by field `id`, would silently fail to render.

// These are hand-built literals, so they never reach the model's toJSON — the
// `isSampleData` marker has to be mapped across explicitly or Settings → Sample
// Data has no way to badge the seeded rows the importer cloned.

const toFieldDTO = (row) => ({
  id: row.site_checkin_field_id,
  label: row.label,
  type: row.type,
  category: row.category,
  isMandatory: row.is_mandatory,
  isActive: row.is_active,
  displayOrder: row.display_order,
  isSampleData: row.is_sample_data === true,
});

const toRecordDTO = (row) => ({
  id: row.site_checkin_record_id,
  jobId: row.job_id,
  jobAddress: row.job_address,
  supplierName: row.supplier_name,
  companyName: row.company_name,
  phone: row.phone,
  email: row.email,
  responses: row.responses || {},
  status: row.status,
  checkedInAt: row.checked_in_at,
  confirmedAt: row.confirmed_at,
  confirmedBy: row.confirmed_by,
  builderNotes: row.builder_notes,
  isSampleData: row.is_sample_data === true,
});

const httpError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

// Default template seeded the first time a builder opens Site Check-In settings.
// Mirrors the frontend DEFAULT_CHECKIN_FIELDS; the builder can edit/delete any.
const DEFAULT_FIELDS = [
  { label: "Full Name", type: "text", category: "personal", is_mandatory: true, is_active: true, display_order: 1 },
  { label: "Company Name", type: "text", category: "personal", is_mandatory: true, is_active: true, display_order: 2 },
  { label: "Phone Number", type: "phone", category: "personal", is_mandatory: true, is_active: true, display_order: 3 },
  { label: "Email Address", type: "email", category: "personal", is_mandatory: false, is_active: true, display_order: 4 },
  { label: "Emergency Contact", type: "phone", category: "personal", is_mandatory: false, is_active: true, display_order: 5 },
  { label: "Hard Hat", type: "checkbox", category: "ppe", is_mandatory: true, is_active: true, display_order: 6 },
  { label: "High Visibility Vest", type: "checkbox", category: "ppe", is_mandatory: true, is_active: true, display_order: 7 },
  { label: "Safety Boots (Steel Cap)", type: "checkbox", category: "ppe", is_mandatory: true, is_active: true, display_order: 8 },
  { label: "Safety Gloves", type: "checkbox", category: "ppe", is_mandatory: true, is_active: true, display_order: 9 },
  { label: "Safety Glasses", type: "checkbox", category: "ppe", is_mandatory: false, is_active: true, display_order: 10 },
  { label: "Hearing Protection", type: "checkbox", category: "ppe", is_mandatory: false, is_active: true, display_order: 11 },
  { label: "Sun Protection (Hat/Sunscreen)", type: "checkbox", category: "ppe", is_mandatory: false, is_active: true, display_order: 12 },
  { label: "White Card / Induction Completed", type: "checkbox", category: "safety", is_mandatory: true, is_active: true, display_order: 13 },
  { label: "Travel Incident / Accident on the Way", type: "textarea", category: "safety", is_mandatory: false, is_active: true, display_order: 14 },
  { label: "Fit for Duty Declaration", type: "checkbox", category: "safety", is_mandatory: true, is_active: true, display_order: 15 },
  { label: "Acknowledged Site Safety Rules", type: "checkbox", category: "safety", is_mandatory: true, is_active: true, display_order: 16 },
  { label: "Vehicle Registration / License Plate", type: "text", category: "other", is_mandatory: false, is_active: true, display_order: 17 },
  { label: "Additional Notes", type: "textarea", category: "other", is_mandatory: false, is_active: false, display_order: 18 },
];

// ─── Fields (builder side) ───────────────────────────────────────────────────

export const listFieldsService = async ({ companyId, builderId, userId }) => {
  const { SiteCheckinField } = db;

  let rows = await SiteCheckinField.findAll({
    where: { company_id: companyId },
    order: [["display_order", "ASC"], ["created_at", "ASC"]],
  });

  // Seed the default template for this company on first access.
  if (rows.length === 0 && companyId) {
    await SiteCheckinField.bulkCreate(
      DEFAULT_FIELDS.map((f) => ({
        ...f,
        company_id: companyId,
        builder_id: builderId || null,
        created_by: userId || null,
        updated_by: userId || null,
      })),
    );
    rows = await SiteCheckinField.findAll({
      where: { company_id: companyId },
      order: [["display_order", "ASC"], ["created_at", "ASC"]],
    });
  }

  return rows.map(toFieldDTO);
};

export const createFieldService = async ({ companyId, builderId, userId, data }) => {
  const { SiteCheckinField } = db;
  if (!companyId) throw httpError("Unauthorized.", 401);

  const created = await SiteCheckinField.create({
    company_id: companyId,
    builder_id: builderId || null,
    label: data.label,
    type: data.type,
    category: data.category,
    is_mandatory: data.is_mandatory,
    is_active: data.is_active,
    display_order: data.display_order,
    created_by: userId || null,
    updated_by: userId || null,
  });
  return toFieldDTO(created);
};

export const updateFieldService = async ({ companyId, userId, fieldId, data }) => {
  const { SiteCheckinField } = db;
  const field = await SiteCheckinField.findOne({
    where: { site_checkin_field_id: fieldId, company_id: companyId },
  });
  if (!field) throw httpError("Check-in field not found.", 404);

  const patch = {};
  if (data.label !== undefined) patch.label = data.label;
  if (data.type !== undefined) patch.type = data.type;
  if (data.category !== undefined) patch.category = data.category;
  if (data.is_mandatory !== undefined) patch.is_mandatory = data.is_mandatory;
  if (data.is_active !== undefined) patch.is_active = data.is_active;
  if (data.display_order !== undefined) patch.display_order = data.display_order;
  patch.updated_by = userId || null;

  await field.update(patch);
  return toFieldDTO(field);
};

export const deleteFieldService = async ({ companyId, fieldId }) => {
  const { SiteCheckinField } = db;
  const field = await SiteCheckinField.findOne({
    where: { site_checkin_field_id: fieldId, company_id: companyId },
  });
  if (!field) throw httpError("Check-in field not found.", 404);
  await field.destroy();
  return { id: fieldId };
};

// ─── Records (builder side) ──────────────────────────────────────────────────

export const listRecordsService = async ({ companyId, query = {} }) => {
  const { SiteCheckinRecord } = db;
  const where = { company_id: companyId };
  if (query.job_id) where.job_id = query.job_id;
  if (query.status) where.status = query.status;

  const rows = await SiteCheckinRecord.findAll({
    where,
    order: [["checked_in_at", "DESC"]],
  });
  return rows.map(toRecordDTO);
};

export const reviewRecordService = async ({ companyId, recordId, status, confirmedBy, builderNotes }) => {
  const { SiteCheckinRecord } = db;
  const record = await SiteCheckinRecord.findOne({
    where: { site_checkin_record_id: recordId, company_id: companyId },
  });
  if (!record) throw httpError("Check-in record not found.", 404);

  await record.update({
    status,
    confirmed_at: new Date(),
    confirmed_by: confirmedBy || null,
    builder_notes: builderNotes || null,
  });
  return toRecordDTO(record);
};

// ─── Public (supplier side, no auth) ─────────────────────────────────────────
// The QR encodes the builder's company_id as the token. Anyone with the link
// can view the active fields and submit a PENDING check-in for that company.

export const getPublicFieldsService = async (token) => {
  const { Company, SiteCheckinField } = db;

  const company = await Company.findOne({
    where: { company_id: token },
    attributes: ["company_id", "name", "company_logo"],
  });
  if (!company) throw httpError("This check-in link is invalid or has expired.", 404);

  const rows = await SiteCheckinField.findAll({
    where: { company_id: token, is_active: true },
    order: [["display_order", "ASC"], ["created_at", "ASC"]],
  });

  return {
    companyName: company.name || "",
    companyLogo: company.company_logo || null,
    fields: rows.map(toFieldDTO),
  };
};

export const submitPublicCheckinService = async (token, data) => {
  const { Company, SiteCheckinField, SiteCheckinRecord } = db;

  const company = await Company.findOne({
    where: { company_id: token },
    attributes: ["company_id", "builder_id"],
  });
  if (!company) throw httpError("This check-in link is invalid or has expired.", 404);

  const activeFields = await SiteCheckinField.findAll({
    where: { company_id: token, is_active: true },
  });

  const responses = data.responses || {};

  // Server-side enforcement of mandatory fields (client validation can be bypassed).
  for (const field of activeFields) {
    if (!field.is_mandatory) continue;
    const value = responses[field.site_checkin_field_id];
    const provided =
      field.type === "checkbox"
        ? value === true
        : value !== undefined && value !== null && String(value).trim() !== "";
    if (!provided) {
      throw httpError(`"${field.label}" is required.`, 400);
    }
  }

  // Drop responses that reference fields not belonging to this company.
  const validIds = new Set(activeFields.map((f) => f.site_checkin_field_id));
  const cleanResponses = {};
  for (const [fieldId, value] of Object.entries(responses)) {
    if (validIds.has(fieldId)) cleanResponses[fieldId] = value;
  }

  const created = await SiteCheckinRecord.create({
    company_id: token,
    builder_id: company.builder_id || null,
    job_id: data.job_id || null,
    job_address: data.job_address || null,
    supplier_name: data.supplier_name || null,
    company_name: data.company_name || null,
    phone: data.phone || null,
    email: data.email || null,
    responses: cleanResponses,
    status: "PENDING",
    checked_in_at: new Date(),
  });

  return toRecordDTO(created);
};

export default {
  listFieldsService,
  createFieldService,
  updateFieldService,
  deleteFieldService,
  listRecordsService,
  reviewRecordService,
  getPublicFieldsService,
  submitPublicCheckinService,
};
