import { Op } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { JOB_FIELD_COLUMNS, getWorkflowTaskColumns } from "./workflow-status-report.service.js";

/**
 * Column customization for the Workflow Status report — same persistence model
 * as the Focus report (report_column_setting, per-user + builder-wide "apply to
 * all"), but the dynamic columns are Workflow Tasks instead of custom fields.
 */
const REPORT_KEY = "workflow_status";

function jobFieldColumns() {
  return JOB_FIELD_COLUMNS.map((c) => ({
    key: c.key,
    label: c.label,
    isWorkflowTask: false,
    sortable: !!c.sortColumn,
    defaultWidth: c.defaultWidth,
  }));
}

function buildDefaultLayout(taskColumns) {
  const layout = [];
  let order = 0;
  for (const c of JOB_FIELD_COLUMNS) {
    layout.push({ key: c.key, label: c.label, visible: true, order: order++, width: c.defaultWidth, isWorkflowTask: false });
  }
  for (const c of taskColumns) {
    layout.push({ key: c.key, label: c.label, visible: true, order: order++, width: c.defaultWidth, isWorkflowTask: true });
  }
  return layout;
}

function reconcileLayout(saved, jobColumns, taskColumns) {
  const validByKey = new Map();
  for (const c of jobColumns) {
    validByKey.set(c.key, { def: c, isWorkflowTask: false });
  }
  for (const c of taskColumns) {
    validByKey.set(c.key, { def: c, isWorkflowTask: true });
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
      isWorkflowTask: match.isWorkflowTask,
    });
  }
  for (const [key, match] of validByKey) {
    if (seen.has(key)) {
      continue;
    }
    layout.push({ key, label: match.def.label, visible: true, order: order++, width: match.def.defaultWidth, isWorkflowTask: match.isWorkflowTask });
  }
  return layout;
}

function scopeWhere(builderId, companyId) {
  const scopeOr = [];
  if (builderId) {
    scopeOr.push({ builder_id: builderId });
  }
  if (companyId) {
    scopeOr.push({ company_id: companyId });
  }
  return { report_key: REPORT_KEY, ...(scopeOr.length ? { [Op.or]: scopeOr } : {}) };
}

export async function getWorkflowColumns({ builderId, companyId, userId }) {
  const jobColumns = jobFieldColumns();
  const taskColumns = await getWorkflowTaskColumns(builderId, companyId);
  const base = scopeWhere(builderId, companyId);

  const [userSetting, builderSetting] = await Promise.all([
    userId ? db.ReportColumnSetting.findOne({ where: { ...base, user_id: userId } }) : null,
    db.ReportColumnSetting.findOne({ where: { ...base, user_id: null } }),
  ]);

  const saved = userSetting?.columns || builderSetting?.columns || null;
  const layout = saved ? reconcileLayout(saved, jobColumns, taskColumns) : buildDefaultLayout(taskColumns);

  return { jobFields: jobColumns, workflowTasks: taskColumns, layout };
}

export async function saveWorkflowColumns({ builderId, companyId, userId, columns, applyToAll = false, actorUserId }) {
  const jobColumns = jobFieldColumns();
  const taskColumns = await getWorkflowTaskColumns(builderId, companyId);
  const validByKey = new Map();
  for (const c of jobColumns) {
    validByKey.set(c.key, { def: c, isWorkflowTask: false });
  }
  for (const c of taskColumns) {
    validByKey.set(c.key, { def: c, isWorkflowTask: true });
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
      isWorkflowTask: match.isWorkflowTask,
    });
  });
  normalized.sort((a, b) => a.order - b.order).forEach((c, i) => {
    c.order = i;
  });

  const targetUserId = applyToAll ? null : userId;
  const existing = await db.ReportColumnSetting.findOne({ where: { ...scopeWhere(builderId, companyId), user_id: targetUserId } });

  if (existing) {
    await existing.update({ columns: normalized, updated_by: actorUserId });
  } else {
    await db.ReportColumnSetting.create({
      builder_id: builderId || null,
      company_id: companyId || null,
      user_id: targetUserId,
      report_key: REPORT_KEY,
      columns: normalized,
      created_by: actorUserId,
      updated_by: actorUserId,
    });
  }

  return { jobFields: jobColumns, workflowTasks: taskColumns, layout: reconcileLayout(normalized, jobColumns, taskColumns) };
}

export default { getWorkflowColumns, saveWorkflowColumns };
