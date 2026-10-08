import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { applySampleDataScope } from "../report-filter.util.js";

/**
 * Sales → Floor Plan / Facade report.
 *
 * One row per quotation, keyed off its "current" version (latest approved,
 * else latest). The FloorPlan and Facade views share the same 12 columns; the
 * `mode` toggle only changes which entity drives the chart grouping and the
 * Dwelling Type / Label (Range) source, and requires that entity to be set.
 * No column customization and no custom fields on this report.
 */

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

const LEAD_STATUS_SQL = "COALESCE((SELECT o.status FROM opportunity o WHERE o.leads_id = l.leads_id LIMIT 1), l.status)";
const DEPOSITED_SQL = "CASE WHEN EXISTS (SELECT 1 FROM invoice iv WHERE iv.leads_id = l.leads_id AND iv.deposite_amount IS NOT NULL) THEN 'Deposited' ELSE NULL END";
const QUOTATION_STATUS_SQL = "CASE WHEN EXISTS (SELECT 1 FROM quotation_version qv WHERE qv.quotation_id = q.quotation_id AND qv.is_approve = true) THEN 'Approved' ELSE 'Draft' END";

const CURRENT_VERSION_LATERAL = `
        LEFT JOIN LATERAL (
          SELECT qv.floor_plan_id, qv.facade_id
          FROM quotation_version qv
          WHERE qv.quotation_id = q.quotation_id
          ORDER BY qv.is_approve DESC, qv.quotation_version_no DESC NULLS LAST
          LIMIT 1
        ) cv ON true`;

export const MODES = Object.freeze({ FLOOR_PLAN: "floor_plan", FACADE: "facade" });
export const TYPES = Object.freeze({ ALL: "all", SALES: "sales", JOB: "job" });

// Fixed column set (identical for both modes).
const COLUMNS = [
  { key: "referenceId", label: "Reference ID", select: "l.reference_number", sortColumn: "l.reference_number" },
  { key: "leadStatus", label: "Lead Status", select: LEAD_STATUS_SQL, sortColumn: null },
  { key: "deposited", label: "Deposited", select: DEPOSITED_SQL, sortColumn: null },
  { key: "customerName", label: "Customer Name", select: "l.name", sortColumn: "l.name" },
  { key: "jobAddress", label: "Job Address", select: PROPERTY_ADDRESS_SQL, sortColumn: null },
  { key: "quotationId", label: "Quotation ID", select: "q.reference_number", sortColumn: "q.reference_number" },
  { key: "quotationStatus", label: "Quotation Status", select: QUOTATION_STATUS_SQL, sortColumn: null },
  { key: "floorPlan", label: "Floor plan", select: "fp.name", sortColumn: "fp.name" },
  { key: "facade", label: "Facade", select: "f.name", sortColumn: "f.name" },
  { key: "dwellingType", label: "Dwelling Type", select: "dt.name", sortColumn: null },
  { key: "label", label: "Label", select: "rg.name", sortColumn: null },
  { key: "assignee", label: "Assignee", select: "assignee.name", sortColumn: "assignee.name" },
];

const SORTABLE = COLUMNS.reduce((acc, c) => {
  if (c.sortColumn) {
    acc[c.key] = c.sortColumn;
  }
  return acc;
}, {});

export const FLOOR_PLAN_REPORT_COLUMNS = COLUMNS.map((c) => ({ key: c.key, label: c.label, sortable: !!c.sortColumn }));

/**
 * Resolve the Period filter into a start/end window on the quotation date.
 * Distinct from the Focus report's relative ranges — these are the calendar
 * options in the Floor Plan report (Current Month, Last Month, …).
 */
function resolvePeriod(period, createdFrom, createdTo) {
  if (createdFrom || createdTo) {
    return {
      start: createdFrom ? new Date(createdFrom) : null,
      end: createdTo ? new Date(createdTo) : null,
    };
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  let start;
  let end;
  switch (String(period || "").toLowerCase()) {
  case "current_month": start = new Date(y, m, 1); break;
  case "last_month": start = new Date(y, m - 1, 1); end = new Date(y, m, 1); break;
  case "last_3_months": start = new Date(y, m - 3, 1); break;
  case "last_6_months": start = new Date(y, m - 6, 1); break;
  case "last_1_year": start = new Date(y - 1, m, 1); break;
  default: break; // no period → all time
  }
  return { start, end };
}

function buildWhere({ mode, type, period, created_from, created_to, dwelling_type_id, range_id, reference, customer_name, job_address, quotation_id, floor_plan, facade, assignee_id, search, builderId, companyId, user }) {
  const where = ["(l.builder_id = :builderId OR (l.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null };
  applySampleDataScope(where, replacements, "l");

  // Mode requires the driving entity to be present.
  if (mode === MODES.FACADE) {
    where.push("cv.facade_id IS NOT NULL");
  } else {
    where.push("cv.floor_plan_id IS NOT NULL");
  }

  // Period window on quotation date.
  const { start, end } = resolvePeriod(period, created_from, created_to);
  if (start) {
    where.push("q.created_at >= :periodStart"); replacements.periodStart = start.toISOString();
  }
  if (end) {
    where.push("q.created_at < :periodEnd"); replacements.periodEnd = end.toISOString();
  }

  // Type: Sales = lead without a job; Job = lead that became a job.
  const jobExists = "EXISTS (SELECT 1 FROM job j JOIN opportunity o ON j.opportunity_id = o.opportunity_id WHERE o.leads_id = l.leads_id)";
  if (type === TYPES.SALES) {
    where.push(`NOT ${jobExists}`);
  } else if (type === TYPES.JOB) {
    where.push(jobExists);
  }

  // Dwelling Type / Label(Range) filter against the mode's entity.
  const dwellingCol = mode === MODES.FACADE ? "f.dwelling_type_id" : "fp.dwelling_type_id";
  const rangeCol = mode === MODES.FACADE ? "f.range_id" : "fp.range_id";
  if (dwelling_type_id) {
    where.push(`${dwellingCol} = :dwellingTypeId`); replacements.dwellingTypeId = dwelling_type_id;
  }
  if (range_id) {
    where.push(`${rangeCol} = :rangeId`); replacements.rangeId = range_id;
  }

  // Per-column search boxes.
  if (reference) {
    where.push("l.reference_number ILIKE :reference"); replacements.reference = `%${reference}%`;
  }
  if (customer_name) {
    where.push("l.name ILIKE :customerName"); replacements.customerName = `%${customer_name}%`;
  }
  if (job_address) {
    where.push(`${PROPERTY_ADDRESS_SQL} ILIKE :jobAddress`); replacements.jobAddress = `%${job_address}%`;
  }
  if (quotation_id) {
    where.push("q.reference_number ILIKE :quotationId"); replacements.quotationId = `%${quotation_id}%`;
  }
  if (floor_plan) {
    where.push("fp.name ILIKE :floorPlan"); replacements.floorPlan = `%${floor_plan}%`;
  }
  if (facade) {
    where.push("f.name ILIKE :facade"); replacements.facade = `%${facade}%`;
  }
  if (assignee_id?.length) {
    where.push("l.assignee_id = ANY(ARRAY[:assigneeId]::uuid[])"); replacements.assigneeId = assignee_id;
  }
  if (search) {
    where.push("(l.reference_number ILIKE :search OR l.name ILIKE :search OR q.reference_number ILIKE :search OR fp.name ILIKE :search OR f.name ILIKE :search)");
    replacements.search = `%${search}%`;
  }

  // Row-level scoping: Sales Executive → own assigned; Agent → own created.
  if (user?.role_name === ROLES.SALES_EXECUTIVE) {
    where.push("l.assignee_id = :scopeUserId"); replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.AGENT) {
    where.push("l.created_by = :scopeUserId"); replacements.scopeUserId = user.users_id || user.id;
  }

  return { whereClause: where.join(" AND "), replacements };
}

// Shared JOIN block; the dwelling/range joins resolve from whichever entity the
// mode drives, so filtering and display stay consistent.
function joins(mode) {
  const dwellingSrc = mode === MODES.FACADE ? "f.dwelling_type_id" : "fp.dwelling_type_id";
  const rangeSrc = mode === MODES.FACADE ? "f.range_id" : "fp.range_id";
  return `
        FROM quotation q
        JOIN leads l ON q.leads_id = l.leads_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        ${CURRENT_VERSION_LATERAL}
        LEFT JOIN floor_plan fp ON cv.floor_plan_id = fp.floor_plan_id
        LEFT JOIN facade f ON cv.facade_id = f.facade_id
        LEFT JOIN dwelling_type dt ON ${dwellingSrc} = dt.dwelling_type_id
        LEFT JOIN range rg ON ${rangeSrc} = rg.range_id`;
}

export async function getFloorPlanReport({ builderId, companyId, user = null, filters = {} }) {
  const mode = String(filters.mode || MODES.FLOOR_PLAN).toLowerCase() === MODES.FACADE ? MODES.FACADE : MODES.FLOOR_PLAN;
  const type = [TYPES.SALES, TYPES.JOB].includes(String(filters.type || "").toLowerCase()) ? String(filters.type).toLowerCase() : TYPES.ALL;

  const pageNum = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(filters.limit, 10) || 25, 1), 200);
  const offset = (pageNum - 1) * limitNum;

  const { whereClause, replacements } = buildWhere({ ...filters, mode, type, builderId, companyId, user });

  const orderColumn = SORTABLE[filters.sort_by] || "q.created_at";
  const orderDir = String(filters.sort_order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const selectList = COLUMNS.map((c) => `${c.select} AS "${c.key}"`).join(",\n          ");

  const dataQuery = `
        SELECT
          q.quotation_id AS "quotationId",
          l.is_sample_data AS "isSampleData",
          ${selectList}
        ${joins(mode)}
        WHERE ${whereClause}
        ORDER BY ${orderColumn} ${orderDir} NULLS LAST, q.created_at DESC NULLS LAST
        LIMIT :limit OFFSET :offset`;

  const countQuery = `SELECT COUNT(*)::int AS total ${joins(mode)} WHERE ${whereClause}`;

  // Chart: counts grouped by the mode's entity name.
  const groupName = mode === MODES.FACADE ? "f.name" : "fp.name";
  const chartQuery = `
        SELECT COALESCE(${groupName}, 'Unknown') AS label, COUNT(*)::int AS count
        ${joins(mode)}
        WHERE ${whereClause}
        GROUP BY COALESCE(${groupName}, 'Unknown')
        ORDER BY count DESC, label ASC
        LIMIT 30`;

  const [rows, countRows, chart] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements: { ...replacements, limit: limitNum, offset }, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(chartQuery, { replacements, type: QueryTypes.SELECT }),
  ]);

  const total = countRows[0]?.total || 0;

  return {
    mode,
    type,
    columns: FLOOR_PLAN_REPORT_COLUMNS,
    rows: rows.map((r) => keysToCamelCase(r)),
    chart,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

/**
 * Dynamic filter option lists (Dwelling Type + Label/Range) for the builder,
 * powering the report's filter dropdowns.
 */
export async function getFloorPlanReportFilters({ builderId, companyId }) {
  const scope = "(builder_id = :builderId OR (company_id = :companyId AND :companyId IS NOT NULL) OR (builder_id IS NULL AND company_id IS NULL))";
  const replacements = { builderId: builderId || null, companyId: companyId || null };

  const [dwellingTypes, ranges] = await Promise.all([
    db.sequelize.query(`SELECT dwelling_type_id AS id, name FROM dwelling_type WHERE ${scope} ORDER BY name ASC`, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(`SELECT range_id AS id, name FROM range WHERE ${scope} ORDER BY sort_order ASC, name ASC`, { replacements, type: QueryTypes.SELECT }),
  ]);

  return { dwellingTypes, labels: ranges };
}

export default { getFloorPlanReport, getFloorPlanReportFilters };
