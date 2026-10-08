import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { applyColumnSearchFilters, applySampleDataScope } from "../report-filter.util.js";
import { getJobSettings } from "../../job/job-automation.service.js";
import { grandTotalSql } from "../../../utils/quotationTotals.sql.js";

/**
 * Job → core list reports (per job). All read from `job`, walking
 * job → opportunity → lead for customer/address/assignee, and job → builder /
 * quotation_version for the rest.
 *
 *   - No Action Jobs: jobs with no notes/tasks/appointments logged.
 *   - Job Status:     per-job completed vs upcoming workflow task counts.
 *   - Milestone Status: one row per milestone workflow task across jobs.
 *   - Customer Status: wide per-job snapshot (many best-effort columns — see notes).
 *
 * Job Status and Milestone Status take their defaults from Settings → Job →
 * Settings (`job_settings`): the day window, which task statuses to include and
 * whether to show dates. Explicit query params still win over the settings.
 */

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

const JOB_LEAD_JOINS = `
        FROM job j
        LEFT JOIN opportunity o ON j.opportunity_id = o.opportunity_id
        LEFT JOIN leads l ON o.leads_id = l.leads_id
        LEFT JOIN lead_source ls ON l.lead_source_id = ls.lead_source_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id`;

// Site Supervisor → own supervised jobs; Contact → own job.
function applyJobScope(user, where, replacements) {
  if (user?.role_name === ROLES.SITE_SUPERVISOR) {
    where.push("j.supervisor_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.CONTACT) {
    where.push("j.customer_contact_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  }
}

function paginate(filters) {
  const pageNum = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(filters.limit, 10) || 25, 1), 200);
  return { pageNum, limitNum, offset: (pageNum - 1) * limitNum };
}

const firstDefined = (...values) => values.find((v) => v !== undefined && v !== null && v !== "");

function toBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

/**
 * Resolve the reporting knobs from Settings → Job → Settings, letting explicit
 * query params override them.
 *
 *   days        — report_custom_days / milestone_status_check_days. The report
 *                 covers the window either side of today: tasks closed in the
 *                 last N days plus tasks due within the next N days. null = no
 *                 window (every task counts).
 *   statusFilter— report_status_filter: all | completed | incompleted.
 *   includeDate — report_include_date: show the date columns.
 */
async function resolveReportSettings({ builderId, companyId, filters, daysField }) {
  const settings = await getJobSettings({ builderId, companyId });

  const rawDays = firstDefined(filters.days, settings?.[daysField]);
  const days = Number(rawDays);

  return {
    windowDays: Number.isFinite(days) && days > 0 ? Math.trunc(days) : null,
    statusFilter: String(
      firstDefined(filters.status_filter, settings?.report_status_filter, "all"),
    ).toLowerCase(),
    includeDate: toBool(firstDefined(filters.include_date, settings?.report_include_date), true),
  };
}

// Postgres `date ± integer` stays a date, so this compares cleanly against the
// DATEONLY columns on job_task.
const withinWindow = (column) =>
  ` AND ${column} BETWEEN CURRENT_DATE - :windowDays::int AND CURRENT_DATE + :windowDays::int`;

async function runReport(dataQuery, countQuery, replacements) {
  const [rows, countRows] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
  ]);
  return { rows: rows.map((r) => keysToCamelCase(r)), total: countRows[0]?.total || 0 };
}

// ─── No Action Jobs ────────────────────────────────────────────────────────
export const NO_ACTION_JOBS_COLUMNS = [
  { key: "referenceId", label: "Reference ID", sortable: true },
  { key: "jobStatus", label: "Job Status", sortable: true },
  { key: "propertyAddress", label: "Property Address" },
  { key: "name", label: "Name", sortable: true },
  { key: "email", label: "Email" },
  { key: "contact", label: "Contact" },
  { key: "jobStartedDate", label: "Job started date", sortable: true },
  { key: "assignee", label: "Assignee" },
  { key: "lastUpdated", label: "Last updated", sortable: true },
];

export async function getNoActionJobsReport({ builderId, companyId, user = null, filters = {} }) {
  const { pageNum, limitNum, offset } = paginate(filters);
  const { search, status, assignee_id, sort_by = "jobStartedDate", sort_order = "desc" } = filters;

  const where = ["(j.builder_id = :builderId OR (j.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");

  // No action = no notes, tasks, or appointments tied to the job.
  where.push(`NOT EXISTS (SELECT 1 FROM notes n WHERE n.job_id = j.job_id)
        AND NOT EXISTS (SELECT 1 FROM task t WHERE t.job_id = j.job_id)
        AND NOT EXISTS (SELECT 1 FROM appointment ap WHERE ap.job_id = j.job_id AND ap.is_deleted = false)`);

  if (status) {
    where.push("j.status = :status"); replacements.status = status;
  }
  if (assignee_id?.length) {
    where.push("l.assignee_id = ANY(ARRAY[:assigneeId]::uuid[])"); replacements.assigneeId = assignee_id;
  }
  if (search) {
    where.push(`(j.reference_number ILIKE :search OR l.name ILIKE :search OR l.email ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "j.reference_number",
    name: "l.name",
    email: "l.email",
    contact: "l.phone",
    property_address: PROPERTY_ADDRESS_SQL,
  });
  applyJobScope(user, where, replacements);

  const whereClause = where.join(" AND ");
  const sortable = { referenceId: "j.reference_number", jobStatus: "j.status", name: "l.name", jobStartedDate: "j.created_at", lastUpdated: "j.updated_at" };
  const orderCol = sortable[sort_by] || "j.created_at";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const dataQuery = `
        SELECT j.job_id AS "jobId", j.reference_number AS "referenceId", j.status AS "jobStatus",
          ${PROPERTY_ADDRESS_SQL} AS "propertyAddress", l.name AS "name", l.email AS "email", l.phone AS "contact",
          j.created_at AS "jobStartedDate", assignee.name AS "assignee", j.updated_at AS "lastUpdated"
        ${JOB_LEAD_JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total ${JOB_LEAD_JOINS} WHERE ${whereClause}`;

  const { rows, total } = await runReport(dataQuery, countQuery, replacements);
  return { columns: NO_ACTION_JOBS_COLUMNS, rows, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } };
}

// ─── Job Status (completed vs upcoming task counts) ─────────────────────────
// The full column set. Which of these actually ship depends on the report
// settings — see buildJobStatusColumns.
export const JOB_STATUS_COLUMNS = [
  { key: "referenceId", label: "Reference ID", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "completedTasks", label: "Completed Tasks" },
  { key: "lastCompletedDate", label: "Last Completed Date" },
  { key: "upcomingTasks", label: "Upcoming Tasks" },
  { key: "nextDueDate", label: "Next Due Date" },
];

function buildJobStatusColumns({ statusFilter, includeDate }) {
  const columns = [
    { key: "referenceId", label: "Reference ID", sortable: true },
    { key: "jobAddress", label: "Job Address" },
  ];

  if (statusFilter !== "incompleted") {
    columns.push({ key: "completedTasks", label: "Completed Tasks" });
    if (includeDate) {
      columns.push({ key: "lastCompletedDate", label: "Last Completed Date" });
    }
  }
  if (statusFilter !== "completed") {
    columns.push({ key: "upcomingTasks", label: "Upcoming Tasks" });
    if (includeDate) {
      columns.push({ key: "nextDueDate", label: "Next Due Date" });
    }
  }

  return columns;
}

export async function getJobStatusReport({ builderId, companyId, user = null, filters = {} }) {
  const { pageNum, limitNum, offset } = paginate(filters);
  const { search, sort_by = "referenceId", sort_order = "asc" } = filters;

  const { windowDays, statusFilter, includeDate } = await resolveReportSettings({
    builderId,
    companyId,
    filters,
    daysField: "report_custom_days",
  });

  const where = ["(j.builder_id = :builderId OR (j.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");
  if (windowDays) {
    replacements.windowDays = windowDays;
  }
  if (search) {
    where.push(`(j.reference_number ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "j.reference_number",
    job_address: PROPERTY_ADDRESS_SQL,
  });
  applyJobScope(user, where, replacements);

  // A completed task is dated by when it was actually done; an upcoming one by
  // when it is planned to finish. With a window configured, only tasks whose
  // date falls inside it count.
  const completedCond = " AND jt.is_completed = true"
    + (windowDays ? withinWindow("COALESCE(jt.actual_date, jt.estimated_end_date)") : "");
  const upcomingCond = " AND jt.is_completed = false"
    + (windowDays ? withinWindow("jt.estimated_end_date") : "");

  const taskAgg = (agg, cond) => `(SELECT ${agg} FROM job_task jt WHERE jt.job_id = j.job_id AND jt.is_synced = true${cond})`;
  const completedTasks = taskAgg("COUNT(*)::int", completedCond);
  const upcomingTasks = taskAgg("COUNT(*)::int", upcomingCond);

  // "Status" narrows the report to jobs that actually have tasks of that kind
  // in the window, so an empty column never occupies a row.
  if (statusFilter === "completed") {
    where.push(`${completedTasks} > 0`);
  } else if (statusFilter === "incompleted") {
    where.push(`${upcomingTasks} > 0`);
  }

  const whereClause = where.join(" AND ");

  const sortable = { referenceId: "j.reference_number" };
  const orderCol = sortable[sort_by] || "j.reference_number";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const selects = [
    "j.job_id AS \"jobId\"",
    "j.is_sample_data AS \"isSampleData\"",
    "j.reference_number AS \"referenceId\"",
    `${PROPERTY_ADDRESS_SQL} AS "jobAddress"`,
  ];
  if (statusFilter !== "incompleted") {
    selects.push(`${completedTasks} AS "completedTasks"`);
    if (includeDate) {
      selects.push(`${taskAgg("MAX(COALESCE(jt.actual_date, jt.estimated_end_date))", completedCond)} AS "lastCompletedDate"`);
    }
  }
  if (statusFilter !== "completed") {
    selects.push(`${upcomingTasks} AS "upcomingTasks"`);
    if (includeDate) {
      selects.push(`${taskAgg("MIN(jt.estimated_end_date)", upcomingCond)} AS "nextDueDate"`);
    }
  }

  const dataQuery = `
        SELECT ${selects.join(",\n          ")}
        ${JOB_LEAD_JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total ${JOB_LEAD_JOINS} WHERE ${whereClause}`;

  const { rows, total } = await runReport(dataQuery, countQuery, replacements);
  return {
    columns: buildJobStatusColumns({ statusFilter, includeDate }),
    rows,
    // What the report was actually produced with, so the UI can label it.
    settings: { days: windowDays, statusFilter, includeDate },
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

// ─── Milestone Task / Checklist Status ──────────────────────────────────────
// One row per milestone workflow task across the builder's jobs, within the
// window from Settings → Job → Settings ("Status of Milestone Task/Checklist —
// report will be generated after N days for all referred jobs").
export const MILESTONE_STATUS_COLUMNS = [
  { key: "referenceId", label: "Reference ID", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "stage", label: "Stage" },
  { key: "milestone", label: "Milestone", sortable: true },
  { key: "status", label: "Status" },
  { key: "dueDate", label: "Due Date", sortable: true },
  { key: "completedDate", label: "Completed Date" },
];

const MILESTONE_JOINS = `
        FROM job_task jt
        JOIN job_sub_stage jss ON jt.sub_stage_id = jss.sub_stage_id
        JOIN job j ON jt.job_id = j.job_id
        LEFT JOIN opportunity o ON j.opportunity_id = o.opportunity_id
        LEFT JOIN leads l ON o.leads_id = l.leads_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id`;

const MILESTONE_STATUS_SQL = `
        CASE
          WHEN jt.is_completed THEN 'Completed'
          WHEN jss.is_skipped THEN 'Skipped'
          WHEN jt.estimated_end_date IS NOT NULL AND jt.estimated_end_date < CURRENT_DATE THEN 'Overdue'
          ELSE 'Upcoming'
        END`;

export async function getMilestoneStatusReport({ builderId, companyId, user = null, filters = {} }) {
  const { pageNum, limitNum, offset } = paginate(filters);
  const { search, sort_by = "dueDate", sort_order = "asc" } = filters;

  const { windowDays, statusFilter, includeDate } = await resolveReportSettings({
    builderId,
    companyId,
    filters,
    daysField: "milestone_status_check_days",
  });

  const where = [
    "(j.builder_id = :builderId OR (j.company_id = :companyId AND :companyId IS NOT NULL))",
    "jt.milestone = true",
    "jt.is_synced = true",
    "jss.is_synced = true",
    "j.status NOT IN ('Archived', 'Cancelled')",
  ];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");

  if (windowDays) {
    where.push(
      "COALESCE(jt.actual_date, jt.estimated_end_date) BETWEEN CURRENT_DATE - :windowDays::int AND CURRENT_DATE + :windowDays::int",
    );
    replacements.windowDays = windowDays;
  }
  if (statusFilter === "completed") {
    where.push("jt.is_completed = true");
  } else if (statusFilter === "incompleted") {
    where.push("jt.is_completed = false");
  }
  if (search) {
    where.push(`(j.reference_number ILIKE :search OR jt.name ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "j.reference_number",
    job_address: PROPERTY_ADDRESS_SQL,
    milestone: "jt.name",
  });
  applyJobScope(user, where, replacements);

  const whereClause = where.join(" AND ");
  const sortable = {
    referenceId: "j.reference_number",
    milestone: "jt.name",
    dueDate: "jt.estimated_end_date",
  };
  const orderCol = sortable[sort_by] || "jt.estimated_end_date";
  const orderDir = String(sort_order).toLowerCase() === "desc" ? "DESC" : "ASC";

  const selects = [
    "jt.job_process_task_id AS \"taskId\"",
    "j.job_id AS \"jobId\"",
    "j.reference_number AS \"referenceId\"",
    `${PROPERTY_ADDRESS_SQL} AS "jobAddress"`,
    "jss.name AS \"stage\"",
    "jt.name AS \"milestone\"",
    `${MILESTONE_STATUS_SQL} AS "status"`,
  ];
  if (includeDate) {
    selects.push("jt.estimated_end_date AS \"dueDate\"", "jt.actual_date AS \"completedDate\"");
  }

  const dataQuery = `
        SELECT ${selects.join(",\n          ")}
        ${MILESTONE_JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST, j.reference_number ASC
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total ${MILESTONE_JOINS} WHERE ${whereClause}`;

  const { rows, total } = await runReport(dataQuery, countQuery, replacements);
  const columns = includeDate
    ? MILESTONE_STATUS_COLUMNS
    : MILESTONE_STATUS_COLUMNS.filter((c) => c.key !== "dueDate" && c.key !== "completedDate");

  return {
    columns,
    rows,
    settings: { days: windowDays, statusFilter, includeDate },
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

// ─── Customer Status (wide snapshot) ────────────────────────────────────────
// Columns with no clean source in the current schema return NULL (best-effort):
// Color Cost/Status/Appointment, Drafting Requested/Completed, Drawing
// Finalised, Permit Approved Date. Refine once those modules are wired.
export const CUSTOMER_STATUS_COLUMNS = [
  { key: "jobRefNo", label: "Job RefNo", sortable: true },
  { key: "customerName", label: "Customer Name", sortable: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "jobAddress", label: "Job Address" },
  { key: "assigneeName", label: "Assignee Name" },
  { key: "leadSource", label: "Lead Source" },
  { key: "builderName", label: "Builder Name" },
  { key: "landTitleDate", label: "Land Title Date" },
  { key: "depositAmount", label: "Deposit Amount ($)" },
  { key: "closedWonDate", label: "Closed Won Date" },
  { key: "colorCost", label: "Color Cost ($)" },
  { key: "colorStatus", label: "Color Status" },
  { key: "colorAppointmentDate", label: "Color Appointment Date" },
  { key: "draftingRequested", label: "Drafting Requested" },
  { key: "draftingCompleted", label: "Drafting Completed" },
  { key: "drawingFinalised", label: "Drawing Finalised" },
  { key: "constructionStatus", label: "Construction Status" },
  { key: "constructionStage", label: "Construction Stage" },
  { key: "permitApprovedDate", label: "Permit Approved Date" },
  { key: "constructionStartDate", label: "Construction Start Date" },
  { key: "notes", label: "Notes" },
  { key: "totalCost", label: "Total Cost ($)" },
];

export async function getCustomerStatusReport({ builderId, companyId, user = null, filters = {} }) {
  const { pageNum, limitNum, offset } = paginate(filters);
  const { search, assignee_id, status, sort_by = "jobRefNo", sort_order = "desc" } = filters;

  const where = ["(j.builder_id = :builderId OR (j.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");
  if (status) {
    where.push("j.status = :status"); replacements.status = status;
  }
  if (assignee_id?.length) {
    where.push("l.assignee_id = ANY(ARRAY[:assigneeId]::uuid[])"); replacements.assigneeId = assignee_id;
  }
  if (search) {
    where.push(`(j.reference_number ILIKE :search OR l.name ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "j.reference_number",
    customer_name: "l.name",
    phone: "l.phone",
    email: "l.email",
    job_address: PROPERTY_ADDRESS_SQL,
    lead_source: "ls.name",
  });
  applyJobScope(user, where, replacements);
  const whereClause = where.join(" AND ");

  const sortable = { jobRefNo: "j.reference_number", customerName: "l.name" };
  const orderCol = sortable[sort_by] || "j.reference_number";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  // Total cost of the job's quotation version (package + price-list + engineer +
  // facade). See utils/quotationTotals.sql.js.
  const totalCostSql = grandTotalSql("j.quotation_version_id", "qv");

  // Current Construction-Workflow sub-stage (first incomplete) name.
  const constructionStageSql = `(
          SELECT jss.name FROM job_sub_stage jss
          JOIN job_process_stage jps ON jss.stage_id = jps.stage_id
          JOIN job_process_stage_functionality func ON jps.functionality_id = func.functionality_id AND func.name = 'Construction Workflow'
          WHERE jss.job_id = j.job_id AND jss.is_synced = true AND jss.is_completed = false AND jss.is_skipped = false
          ORDER BY jss.sort_order ASC LIMIT 1)`;

  const dataQuery = `
        SELECT
          j.is_sample_data AS "isSampleData",
          j.reference_number AS "jobRefNo", l.name AS "customerName", l.phone AS "phone", l.email AS "email",
          ${PROPERTY_ADDRESS_SQL} AS "jobAddress", assignee.name AS "assigneeName", ls.name AS "leadSource",
          b.name AS "builderName", pd.title_date AS "landTitleDate",
          (SELECT iv.deposite_amount FROM invoice iv WHERE iv.leads_id = l.leads_id AND iv.deposite_amount IS NOT NULL ORDER BY iv.created_at ASC LIMIT 1) AS "depositAmount",
          (SELECT op.updated_at FROM opportunity op WHERE op.leads_id = l.leads_id AND op.out_come = 'won' LIMIT 1) AS "closedWonDate",
          NULL::numeric AS "colorCost", NULL::text AS "colorStatus", j.color_approved_at AS "colorAppointmentDate",
          NULL::date AS "draftingRequested", NULL::date AS "draftingCompleted", NULL::text AS "drawingFinalised",
          j.status AS "constructionStatus", ${constructionStageSql} AS "constructionStage",
          NULL::date AS "permitApprovedDate", j.preconstruction_closed_at AS "constructionStartDate",
          j.job_note AS "notes", ${totalCostSql} AS "totalCost"
        ${JOB_LEAD_JOINS}
        LEFT JOIN builder b ON j.builder_id = b.builder_id
        LEFT JOIN quotation_version qv ON j.quotation_version_id = qv.quotation_version_id
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total ${JOB_LEAD_JOINS} WHERE ${whereClause}`;

  const { rows, total } = await runReport(dataQuery, countQuery, replacements);
  return { columns: CUSTOMER_STATUS_COLUMNS, rows, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } };
}

export default { getNoActionJobsReport, getJobStatusReport, getCustomerStatusReport };
