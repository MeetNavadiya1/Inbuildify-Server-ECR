import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { LEAD_FOCUS_COLUMNS } from "./report-columns.catalog.js";

const CUSTOM_FIELD_MODULE_NAME = "Lead";
const CUSTOM_KEY_PREFIX = "cf_";

/**
 * Active custom fields for the Lead module, scoped to the builder/company,
 * shaped as report column definitions.
 */
async function getLeadCustomFieldColumns(builderId, companyId) {
  const leadModule = await db.CustomFieldModule.findOne({
    where: { name: CUSTOM_FIELD_MODULE_NAME },
    attributes: ["module_id"],
  });
  if (!leadModule) {
    return [];
  }

  const scopeOr = [];
  if (builderId) {
    scopeOr.push({ builder_id: builderId });
  }
  if (companyId) {
    scopeOr.push({ company_id: companyId });
  }

  const fields = await db.CustomField.findAll({
    where: {
      module_id: leadModule.module_id,
      is_active: true,
      ...(scopeOr.length ? { [Op.or]: scopeOr } : {}),
    },
    order: [["sort_order", "ASC"], ["created_at", "ASC"]],
    attributes: ["custom_field_id", "field_name", "field_type"],
  });

  return fields.map((f) => ({
    key: `${CUSTOM_KEY_PREFIX}${f.custom_field_id}`,
    label: f.field_name,
    isCustom: true,
    customFieldId: f.custom_field_id,
    fieldType: f.field_type,
    defaultWidth: 150,
  }));
}

// Standard "Lead Fields" column definitions from the catalog.
function getLeadFieldColumns() {
  return LEAD_FOCUS_COLUMNS.map((c) => ({
    key: c.key,
    label: c.label,
    isCustom: false,
    customFieldId: null,
    sortable: !!c.sortColumn,
    defaultWidth: c.defaultWidth,
  }));
}

// The default layout when the user (and builder) have saved nothing: every
// standard column in catalog order (respecting defaultVisible) followed by all
// custom fields, visible.
function buildDefaultLayout(customColumns) {
  const layout = [];
  let order = 0;
  for (const c of LEAD_FOCUS_COLUMNS) {
    layout.push({ key: c.key, label: c.label, visible: c.defaultVisible !== false, order: order++, width: c.defaultWidth, isCustom: false, customFieldId: null });
  }
  for (const c of customColumns) {
    layout.push({ key: c.key, label: c.label, visible: true, order: order++, width: c.defaultWidth, isCustom: true, customFieldId: c.customFieldId });
  }
  return layout;
}

// Merge a saved layout with the current valid columns: keep the user's saved
// order/visibility/label/width for columns that still exist, drop stale ones,
// and append newly-added columns (e.g. a custom field created after the save)
// as visible defaults at the end.
function reconcileLayout(saved, leadColumns, customColumns) {
  const validByKey = new Map();
  for (const c of leadColumns) {
    validByKey.set(c.key, { def: c, isCustom: false });
  }
  for (const c of customColumns) {
    validByKey.set(c.key, { def: c, isCustom: true });
  }

  const seen = new Set();
  const layout = [];
  let order = 0;

  for (const item of Array.isArray(saved) ? saved : []) {
    const match = validByKey.get(item.key);
    if (!match || seen.has(item.key)) {
      continue;
    }
    seen.add(item.key);
    layout.push({
      key: item.key,
      label: item.label ?? match.def.label,
      visible: item.visible !== false,
      order: order++,
      width: item.width ?? match.def.defaultWidth,
      isCustom: match.isCustom,
      customFieldId: match.isCustom ? match.def.customFieldId : null,
    });
  }

  for (const [key, match] of validByKey) {
    if (seen.has(key)) {
      continue;
    }
    layout.push({
      key,
      label: match.def.label,
      visible: true,
      order: order++,
      width: match.def.defaultWidth,
      isCustom: match.isCustom,
      customFieldId: match.isCustom ? match.def.customFieldId : null,
    });
  }

  return layout;
}

/**
 * Column catalog + effective layout for a report.
 * Layout precedence: the user's saved row → the builder-wide default
 * (user_id NULL) → the system default.
 */
export async function getReportColumns({ builderId, companyId, userId, reportKey }) {
  const leadColumns = getLeadFieldColumns();
  const customColumns = await getLeadCustomFieldColumns(builderId, companyId);

  const scopeOr = [];
  if (builderId) {
    scopeOr.push({ builder_id: builderId });
  }
  if (companyId) {
    scopeOr.push({ company_id: companyId });
  }
  const baseWhere = {
    report_key: reportKey,
    ...(scopeOr.length ? { [Op.or]: scopeOr } : {}),
  };

  const [userSetting, builderSetting] = await Promise.all([
    userId ? db.ReportColumnSetting.findOne({ where: { ...baseWhere, user_id: userId } }) : null,
    db.ReportColumnSetting.findOne({ where: { ...baseWhere, user_id: null } }),
  ]);

  const saved = userSetting?.columns || builderSetting?.columns || null;
  const layout = saved
    ? reconcileLayout(saved, leadColumns, customColumns)
    : buildDefaultLayout(customColumns);

  return {
    leadFields: leadColumns,
    customFields: customColumns,
    layout,
  };
}

/**
 * Persist a column layout. When applyToAll is true the layout is stored as the
 * builder-wide default (user_id NULL); otherwise it's stored for the acting
 * user. Returns the reconciled layout so the caller can echo it back.
 */
export async function saveReportColumns({ builderId, companyId, userId, reportKey, columns, applyToAll = false, actorUserId }) {
  // Normalise incoming columns to the stored shape, ignoring unknown keys.
  const leadColumns = getLeadFieldColumns();
  const customColumns = await getLeadCustomFieldColumns(builderId, companyId);
  const validByKey = new Map();
  for (const c of leadColumns) {
    validByKey.set(c.key, { def: c, isCustom: false });
  }
  for (const c of customColumns) {
    validByKey.set(c.key, { def: c, isCustom: true });
  }

  const seen = new Set();
  const normalized = [];
  (Array.isArray(columns) ? columns : []).forEach((item, idx) => {
    const match = validByKey.get(item.key);
    if (!match || seen.has(item.key)) {
      return;
    }
    seen.add(item.key);
    normalized.push({
      key: item.key,
      label: item.label ?? match.def.label,
      visible: item.visible !== false,
      order: Number.isInteger(item.order) ? item.order : idx,
      width: Number.isFinite(item.width) ? item.width : match.def.defaultWidth,
      isCustom: match.isCustom,
      customFieldId: match.isCustom ? match.def.customFieldId : null,
    });
  });
  normalized.sort((a, b) => a.order - b.order).forEach((c, i) => {
    c.order = i;
  });

  const targetUserId = applyToAll ? null : userId;

  const scopeOr = [];
  if (builderId) {
    scopeOr.push({ builder_id: builderId });
  }
  if (companyId) {
    scopeOr.push({ company_id: companyId });
  }

  const existing = await db.ReportColumnSetting.findOne({
    where: {
      report_key: reportKey,
      user_id: targetUserId,
      ...(scopeOr.length ? { [Op.or]: scopeOr } : {}),
    },
  });

  if (existing) {
    await existing.update({ columns: normalized, updated_by: actorUserId });
  } else {
    await db.ReportColumnSetting.create({
      builder_id: builderId || null,
      company_id: companyId || null,
      user_id: targetUserId,
      report_key: reportKey,
      columns: normalized,
      created_by: actorUserId,
      updated_by: actorUserId,
    });
  }

  // Echo the same reconciled full layout a GET would return (saved columns in
  // their order + any remaining columns appended), so the client can render
  // immediately without a follow-up fetch.
  const layout = reconcileLayout(normalized, leadColumns, customColumns);
  return { leadFields: leadColumns, customFields: customColumns, layout };
}

export default { getReportColumns, saveReportColumns };
