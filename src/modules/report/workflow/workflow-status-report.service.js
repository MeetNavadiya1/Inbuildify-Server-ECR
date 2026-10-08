import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";

/**
 * Workflow → Workflow Status report.
 *
 * One row per job, showing the fixed Job Fields plus a dynamic column per
 * workflow task (grouped "Task (Stage)"). Each task cell carries a derived
 * status + date. A chart counts jobs by their current (active) workflow stage.
 *
 * Data model: workflow lives in the per-job instance tables
 *   job_sub_stage (stage = e.g. Deposit/Concept, is_completed/is_skipped)
 *     └─ job_task (the task, is_completed + actual_date)
 * scoped to workflow functionalities via job_sub_stage.stage_id →
 * job_process_stage → job_process_stage_functionality (is_workflow = true).
 *
 * Task status is DERIVED (the schema has no status enum on a task):
 *   Completed     — job_task.is_completed
 *   Skipped       — parent sub-stage.is_skipped
 *   Not Applicable— job_task.is_synced = false
 *   In Progress   — task's sub-stage is the job's current (first incomplete) one
 *   Yet to start  — otherwise
 * ("Rejected" has no source yet and never derives.)
 */

export const TASK_STATUSES = Object.freeze([
  "Yet to start", "In Progress", "Completed", "Skipped", "Not Applicable", "Rejected",
]);

// Restrict a job's sub-stages/tasks to workflow functionalities only.
const WORKFLOW_SUBSTAGE_EXISTS = `
  EXISTS (
    SELECT 1 FROM job_process_stage jps
    JOIN job_process_stage_functionality func ON jps.functionality_id = func.functionality_id AND func.is_workflow = true
    WHERE jps.stage_id = jss.stage_id
  )`;

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

// Fixed Job Fields (the "Job Fields" tab of the customizer).
export const JOB_FIELD_COLUMNS = [
  { key: "referenceId", label: "Reference ID", select: "j.reference_number", sortColumn: "j.reference_number", defaultWidth: 130 },
  { key: "customerName", label: "Customer Name", select: "l.name", sortColumn: "l.name", defaultWidth: 130 },
  { key: "jobAddress", label: "Job Address", select: PROPERTY_ADDRESS_SQL, sortColumn: null, defaultWidth: 150 },
  { key: "dwellingType", label: "Dwelling Type", select: "dt.name", sortColumn: "dt.name", defaultWidth: 135 },
  { key: "assignee", label: "Assignee", select: "assignee.name", sortColumn: "assignee.name", defaultWidth: 135 },
  { key: "leadSource", label: "Lead Source", select: "ls.name", sortColumn: "ls.name", defaultWidth: 135 },
  { key: "supervisorName", label: "Supervisor Name", select: "supervisor.name", sortColumn: "supervisor.name", defaultWidth: 135 },
  { key: "jobCompletionDate", label: "Job Completion Date", select: "j.preconstruction_closed_at", sortColumn: "j.preconstruction_closed_at", defaultWidth: 155 },
];

const JOB_FIELD_SORTABLE = JOB_FIELD_COLUMNS.reduce((acc, c) => {
  if (c.sortColumn) {
    acc[c.key] = c.sortColumn;
  }
  return acc;
}, {});

const JOB_FIELD_JOINS = `
        FROM job j
        LEFT JOIN opportunity o ON j.opportunity_id = o.opportunity_id
        LEFT JOIN leads l ON o.leads_id = l.leads_id
        LEFT JOIN lead_source ls ON l.lead_source_id = ls.lead_source_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        LEFT JOIN users supervisor ON j.supervisor_id = supervisor.users_id
        LEFT JOIN quotation_version qv ON j.quotation_version_id = qv.quotation_version_id
        LEFT JOIN floor_plan fp ON qv.floor_plan_id = fp.floor_plan_id
        LEFT JOIN dwelling_type dt ON fp.dwelling_type_id = dt.dwelling_type_id`;

// Stable key for a workflow-task column, derived from its stage + task name
// (job instances copy names from the template, so names are the join key).
function taskKey(stageName, taskName) {
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `wt_${slug(stageName)}__${slug(taskName)}`;
}

/**
 * Distinct workflow-task columns present in the builder's job workflows,
 * ordered by sub-stage then task sort order. These are the "Workflow Tasks"
 * dynamic columns.
 */
export async function getWorkflowTaskColumns(builderId, companyId) {
  const rows = await db.sequelize.query(
    `SELECT jss.name AS stage_name, jt.name AS task_name,
            MIN(jss.sort_order) AS ss_order, MIN(jt.sort_order) AS t_order
     FROM job_task jt
     JOIN job_sub_stage jss ON jt.sub_stage_id = jss.sub_stage_id
     JOIN job j ON jt.job_id = j.job_id
     WHERE (j.builder_id = :builderId OR (j.company_id = :companyId AND :companyId IS NOT NULL))
       AND jt.is_synced = true AND ${WORKFLOW_SUBSTAGE_EXISTS}
     GROUP BY jss.name, jt.name
     ORDER BY MIN(jss.sort_order) ASC, MIN(jt.sort_order) ASC`,
    { replacements: { builderId: builderId || null, companyId: companyId || null }, type: QueryTypes.SELECT },
  );

  return rows.map((r) => ({
    key: taskKey(r.stage_name, r.task_name),
    label: `${r.task_name} (${r.stage_name})`,
    isWorkflowTask: true,
    stageName: r.stage_name,
    taskName: r.task_name,
    defaultWidth: 100,
  }));
}

function resolveJobStatusExclusions({ includeCancelled, includeArchived, includeCompleted }) {
  const excluded = [];
  if (!includeCancelled) {
    excluded.push("Cancelled");
  }
  if (!includeArchived) {
    excluded.push("Archived");
  }
  if (!includeCompleted) {
    excluded.push("Completed");
  }
  return excluded;
}

// Derive a single task's status from its instance flags + the job's current
// sub-stage id (first incomplete, non-skipped, synced sub-stage by sort order).
function deriveTaskStatus(task, currentSubStageId) {
  if (task.is_synced === false) {
    return "Not Applicable";
  }
  if (task.is_completed) {
    return "Completed";
  }
  if (task.ss_skipped) {
    return "Skipped";
  }
  if (task.sub_stage_id === currentSubStageId) {
    return "In Progress";
  }
  return "Yet to start";
}

/**
 * Main report. Returns fixed + workflow-task columns, one row per job with a
 * `workflowTasks` map (columnKey → { status, date }), the stage-count chart,
 * and pagination.
 */
export async function getWorkflowStatusReport({ builderId, companyId, filters = {} }) {
  const {
    page = 1,
    limit = 25,
    search,
    dwelling_type_id,
    assignee_id,
    lead_source_id,
    supervisor_id,
    completion_from,
    completion_to,
    include_cancelled_jobs,
    include_archived_jobs,
    include_completed_jobs,
    include_workflow_completed_jobs,
    conditions,
    sort_by = "referenceId",
    sort_order = "desc",
  } = filters;

  const bool = (v) => v === true || v === "true";
  const includeCancelled = bool(include_cancelled_jobs);
  const includeArchived = bool(include_archived_jobs);
  const includeCompleted = bool(include_completed_jobs);
  const includeWorkflowCompleted = bool(include_workflow_completed_jobs);

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
  const offset = (pageNum - 1) * limitNum;

  const where = ["(j.builder_id = :builderId OR (j.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");

  // Only jobs that actually have a workflow.
  where.push(`EXISTS (SELECT 1 FROM job_sub_stage jss WHERE jss.job_id = j.job_id AND jss.is_synced = true AND ${WORKFLOW_SUBSTAGE_EXISTS})`);

  // Lifecycle toggles.
  const excluded = resolveJobStatusExclusions({ includeCancelled, includeArchived, includeCompleted });
  if (excluded.length) {
    where.push(`j.status NOT IN (${excluded.map((_, i) => `:exStatus${i}`).join(", ")})`);
    excluded.forEach((s, i) => {
      replacements[`exStatus${i}`] = s;
    });
  }

  // By default hide jobs whose workflow is fully done (no incomplete sub-stage).
  if (!includeWorkflowCompleted) {
    where.push(`EXISTS (SELECT 1 FROM job_sub_stage jss WHERE jss.job_id = j.job_id AND jss.is_synced = true AND jss.is_completed = false AND jss.is_skipped = false AND ${WORKFLOW_SUBSTAGE_EXISTS})`);
  }

  // Job-field filters.
  if (dwelling_type_id) {
    where.push("fp.dwelling_type_id = :dwellingTypeId"); replacements.dwellingTypeId = dwelling_type_id;
  }
  if (assignee_id?.length) {
    where.push("l.assignee_id = ANY(ARRAY[:assigneeId]::uuid[])"); replacements.assigneeId = assignee_id;
  }
  if (lead_source_id?.length) {
    where.push("l.lead_source_id = ANY(ARRAY[:leadSourceId]::uuid[])"); replacements.leadSourceId = lead_source_id;
  }
  if (supervisor_id?.length) {
    where.push("j.supervisor_id = ANY(ARRAY[:supervisorId]::uuid[])"); replacements.supervisorId = supervisor_id;
  }
  if (completion_from) {
    where.push("j.preconstruction_closed_at >= :completionFrom"); replacements.completionFrom = completion_from;
  }
  if (completion_to) {
    where.push("j.preconstruction_closed_at <= :completionTo"); replacements.completionTo = completion_to;
  }
  if (search) {
    where.push(`(j.reference_number ILIKE :search OR l.name ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }

  // Task/Status multi-condition filter. Each condition: { taskName, stageName,
  // status, op } where op is '=' (EXISTS) or '!=' (NOT EXISTS).
  const parsedConditions = parseConditions(conditions);
  parsedConditions.forEach((c, i) => {
    const statusPred = taskStatusPredicate(c.status);
    if (!statusPred) {
      return;
    }
    const nameMatch = [`jt.name = :ctask${ i}`];
    replacements[`ctask${ i}`] = c.taskName;
    if (c.stageName) {
      nameMatch.push(`jss.name = :cstage${ i}`); replacements[`cstage${ i}`] = c.stageName;
    }
    const sub = `SELECT 1 FROM job_task jt JOIN job_sub_stage jss ON jt.sub_stage_id = jss.sub_stage_id WHERE jt.job_id = j.job_id AND ${nameMatch.join(" AND ")} AND ${statusPred}`;
    where.push(c.op === "!=" ? `NOT EXISTS (${sub})` : `EXISTS (${sub})`);
  });

  const whereClause = where.join(" AND ");
  const orderColumn = JOB_FIELD_SORTABLE[sort_by] || "j.reference_number";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";
  const selectList = JOB_FIELD_COLUMNS.map((c) => `${c.select} AS "${c.key}"`).join(",\n          ");

  const dataQuery = `
        SELECT j.job_id AS "jobId", ${selectList}
        ${JOB_FIELD_JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderColumn} ${orderDir} NULLS LAST, j.created_at DESC NULLS LAST
        LIMIT :limit OFFSET :offset`;

  const countQuery = `SELECT COUNT(*)::int AS total ${JOB_FIELD_JOINS} WHERE ${whereClause}`;

  // Chart: jobs grouped by their current (active) workflow stage.
  const chartQuery = `
        WITH matched AS (
          SELECT j.job_id ${JOB_FIELD_JOINS} WHERE ${whereClause}
        ),
        current_stage AS (
          SELECT DISTINCT ON (jss.job_id) jss.job_id, jss.name AS stage_name
          FROM job_sub_stage jss
          JOIN matched m ON jss.job_id = m.job_id
          WHERE jss.is_synced = true AND jss.is_completed = false AND jss.is_skipped = false AND ${WORKFLOW_SUBSTAGE_EXISTS}
          ORDER BY jss.job_id, jss.sort_order ASC
        )
        SELECT stage_name AS label, COUNT(*)::int AS count
        FROM current_stage GROUP BY stage_name ORDER BY count DESC`;

  const [rows, countRows, chart] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(chartQuery, { replacements, type: QueryTypes.SELECT }),
  ]);

  const jobIds = rows.map((r) => r.jobId);
  const tasksByJob = await loadJobTasks(jobIds);

  const workflowTaskColumns = await getWorkflowTaskColumns(builderId, companyId);

  const shapedRows = rows.map((r) => {
    const camel = keysToCamelCase(r);
    camel.workflowTasks = tasksByJob.get(r.jobId) || {};
    return camel;
  });

  const total = countRows[0]?.total || 0;

  return {
    columns: {
      jobFields: JOB_FIELD_COLUMNS.map((c) => ({ key: c.key, label: c.label, sortable: !!c.sortColumn, defaultWidth: c.defaultWidth })),
      workflowTasks: workflowTaskColumns.map((c) => ({ key: c.key, label: c.label, isWorkflowTask: true, defaultWidth: c.defaultWidth })),
    },
    rows: shapedRows,
    chart,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

// For the page's jobs, load every workflow task and build a per-job map
// { columnKey: { status, date } } with the derived status.
async function loadJobTasks(jobIds) {
  const map = new Map();
  if (!jobIds.length) {
    return map;
  }

  const rows = await db.sequelize.query(
    `SELECT jt.job_id, jt.sub_stage_id, jss.name AS stage_name, jt.name AS task_name,
            jt.is_completed, jt.is_synced, jt.actual_date, jss.sort_order AS ss_order,
            jss.is_skipped AS ss_skipped, jss.is_completed AS ss_completed
     FROM job_task jt
     JOIN job_sub_stage jss ON jt.sub_stage_id = jss.sub_stage_id
     WHERE jt.job_id = ANY(ARRAY[:jobIds]::uuid[]) AND ${WORKFLOW_SUBSTAGE_EXISTS}
     ORDER BY jss.sort_order ASC, jt.sort_order ASC`,
    { replacements: { jobIds }, type: QueryTypes.SELECT },
  );

  // Current sub-stage per job = first (lowest sort_order) synced sub-stage that
  // is not completed and not skipped.
  const currentByJob = new Map();
  const seenIncomplete = new Set();
  for (const t of rows) {
    if (seenIncomplete.has(t.job_id)) {
      continue;
    }
    if (t.is_synced !== false && !t.ss_completed && !t.ss_skipped) {
      currentByJob.set(t.job_id, t.sub_stage_id);
      seenIncomplete.add(t.job_id);
    }
  }

  for (const t of rows) {
    if (!map.has(t.job_id)) {
      map.set(t.job_id, {});
    }
    const status = deriveTaskStatus(t, currentByJob.get(t.job_id));
    map.get(t.job_id)[taskKey(t.stage_name, t.task_name)] = {
      status,
      date: t.actual_date || null,
    };
  }
  return map;
}

// SQL predicate matching a derived task status (aliases: jt = job_task,
// jss = job_sub_stage). In-progress/yet-to-start collapse to "pending".
function taskStatusPredicate(status) {
  switch (String(status || "").toLowerCase()) {
  case "completed": return "jt.is_completed = true";
  case "skipped": return "jss.is_skipped = true AND jt.is_completed = false";
  case "not applicable": return "jt.is_synced = false";
  case "in progress":
  case "yet to start":
  case "rejected":
    return "jt.is_synced = true AND jt.is_completed = false AND jss.is_skipped = false";
  default: return null;
  }
}

function parseConditions(conditions) {
  if (!conditions) {
    return [];
  }
  let arr = conditions;
  if (typeof conditions === "string") {
    try {
      arr = JSON.parse(conditions);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) {
    return [];
  }
  return arr
    .filter((c) => c && c.taskName && c.status)
    .map((c) => ({ taskName: c.taskName, stageName: c.stageName || null, status: c.status, op: c.op === "!=" ? "!=" : "=" }));
}

export default { getWorkflowStatusReport, getWorkflowTaskColumns };
