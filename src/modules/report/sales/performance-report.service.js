import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { sampleDataSqlScope } from "../../../config/database/models/postgre-models/sampleDataFlag.js";

/**
 * Sales → Performance report.
 *
 * Driven by Role + User over a Period. The main view is a per-user metric
 * matrix (Leads, Opportunities, Quotations, Sales, Meetings) attributed by the
 * lead's Assignee; a "Sale" is a lead that converted to a Job. Optionally, a
 * "list report" of a chosen type returns the underlying detail rows.
 *
 * Period basis: each record's Created date within the window; when
 * `show_updated` is on, records Updated in the window are also included.
 */

export const LIST_TYPES = Object.freeze({
  NONE: "none",
  LEAD: "lead",
  OPPORTUNITIES: "opportunities",
  QUOTATION: "quotation",
  SALES: "sales",
  MEETING: "meeting",
});

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

const LEAD_JOINS = `
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        LEFT JOIN users creator ON l.created_by = creator.users_id`;

const TENANT_SCOPE = "(l.builder_id = :builderId OR (l.company_id = :companyId AND :companyId IS NOT NULL))";

/**
 * Tenant scope, narrowed to the caller's own demo rows.
 *
 * Every metric and every list here hangs off a lead, so filtering the lead alias
 * carries the whole report: the demo pipeline is cloned per person, and counting
 * all of it would report one colleague's imported dataset on top of another's.
 * Called per query rather than held in a constant — who is asking is a property
 * of the request, and this module is loaded once.
 */
function leadScope() {
  const { sql } = sampleDataSqlScope("l");
  return sql ? `${TENANT_SCOPE} AND ${sql}` : TENANT_SCOPE;
}

/** The same rule for the staff matrix — demo teammates are cloned per person too. */
function userScope() {
  const { sql } = sampleDataSqlScope("u");
  return sql ? ` AND ${sql}` : "";
}

/**
 * Resolve the Period selector (or explicit start/end) into a window.
 * Returns { start: Date|null, end: Date|null, label }.
 */
export function resolvePeriod(period, startDate, endDate) {
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : null;
    // Make the end date inclusive by advancing to the next day's start.
    let end = null;
    if (endDate) {
      end = new Date(endDate);
      end.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 1);
    }
    return { start, end, label: "custom" };
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start;
  let end;
  switch (String(period || "").toLowerCase()) {
  case "today": start = startOfToday; break;
  case "yesterday": start = new Date(startOfToday.getTime() - 86400000); end = startOfToday; break;
  case "last_7_days": start = new Date(startOfToday.getTime() - 7 * 86400000); break;
  case "last_15_days": start = new Date(startOfToday.getTime() - 15 * 86400000); break;
  case "last_30_days": start = new Date(startOfToday.getTime() - 30 * 86400000); break;
  case "this_month": start = new Date(y, m, 1); break;
  case "last_month": start = new Date(y, m - 1, 1); end = new Date(y, m, 1); break;
  case "last_3_months": start = new Date(y, m - 3, 1); break;
  case "last_6_months": start = new Date(y, m - 6, 1); break;
  case "last_1_year": start = new Date(y - 1, m, 1); break;
  default: break; // all time
  }
  return { start, end, label: period || "all" };
}

// SQL fragment restricting an aliased table's created/updated columns to the
// period window. Adds :pStart / :pEnd replacements (shared across subqueries).
function periodPredicate(createdCol, updatedCol, showUpdated, hasWindow) {
  if (!hasWindow) {
    return "TRUE";
  }
  const created = `(${createdCol} >= :pStart AND ${createdCol} < :pEnd)`;
  if (!showUpdated) {
    return created;
  }
  return `(${created} OR (${updatedCol} >= :pStart AND ${updatedCol} < :pEnd))`;
}

// Which job statuses to exclude from "Sales" unless the toggles include them.
function jobStatusPredicate(includeCancelled, includeArchived) {
  const excluded = [];
  if (!includeCancelled) {
    excluded.push("Cancelled");
  }
  if (!includeArchived) {
    excluded.push("Archived");
  }
  if (!excluded.length) {
    return "TRUE";
  }
  return `j.status NOT IN (${excluded.map((s) => `'${s}'`).join(", ")})`;
}

/**
 * The per-user metric matrix + the candidate user id set (used to scope the
 * list report to the same Role/User selection).
 */
async function getSummary({ roleId, userId, window, showUpdated, showCustomerMeetingOnly, includeCancelled, includeArchived, replacements }) {
  const hasWindow = !!(window.start && window.end) || !!window.start;
  const pLead = periodPredicate("l.created_at", "l.updated_at", showUpdated, hasWindow);
  const pOpp = periodPredicate("o.created_at", "o.updated_at", showUpdated, hasWindow);
  const pQuot = periodPredicate("q.created_at", "q.updated_at", showUpdated, hasWindow);
  const pJob = periodPredicate("j.created_at", "j.updated_at", showUpdated, hasWindow);
  const pAppt = periodPredicate("ap.created_at", "ap.updated_at", showUpdated, hasWindow);
  const jobStatus = jobStatusPredicate(includeCancelled, includeArchived);
  const customerMeeting = showCustomerMeetingOnly ? "AND ap.send_appointment_customer = true" : "";

  const userFilters = [];
  if (roleId) {
    userFilters.push("u.role_id = :roleId");
  }
  if (userId) {
    userFilters.push("u.users_id = :userId");
  }
  const userWhere = userFilters.length ? `AND ${userFilters.join(" AND ")}` : "";

  const query = `
    SELECT
      u.users_id AS user_id,
      u.name AS user_name,
      r.name AS role_name,
      (SELECT COUNT(*)::int FROM leads l WHERE l.assignee_id = u.users_id AND ${leadScope()} AND ${pLead}) AS leads,
      (SELECT COUNT(*)::int FROM opportunity o JOIN leads l ON o.leads_id = l.leads_id WHERE l.assignee_id = u.users_id AND ${leadScope()} AND ${pOpp}) AS opportunities,
      (SELECT COUNT(*)::int FROM quotation q JOIN leads l ON q.leads_id = l.leads_id WHERE l.assignee_id = u.users_id AND ${leadScope()} AND ${pQuot}) AS quotations,
      (SELECT COUNT(*)::int FROM job j JOIN opportunity o ON j.opportunity_id = o.opportunity_id JOIN leads l ON o.leads_id = l.leads_id WHERE l.assignee_id = u.users_id AND ${leadScope()} AND ${jobStatus} AND ${pJob}) AS sales,
      (SELECT COUNT(*)::int FROM appointment ap JOIN leads l ON ap.lead_id = l.leads_id WHERE l.assignee_id = u.users_id AND ap.is_deleted = false ${customerMeeting} AND ${leadScope()} AND ${pAppt}) AS meetings
    FROM users u
    LEFT JOIN role r ON u.role_id = r.role_id
    WHERE (u.builder_id = :builderId OR (u.company_id = :companyId AND :companyId IS NOT NULL))
      AND u.is_active = true AND u.is_deleted = false${userScope()}
      ${userWhere}
    ORDER BY u.name ASC`;

  const rows = await db.sequelize.query(query, { replacements, type: QueryTypes.SELECT });

  const summary = rows.map((r) => keysToCamelCase(r));
  const totals = summary.reduce((acc, r) => {
    acc.leads += r.leads;
    acc.opportunities += r.opportunities;
    acc.quotations += r.quotations;
    acc.sales += r.sales;
    acc.meetings += r.meetings;
    return acc;
  }, { leads: 0, opportunities: 0, quotations: 0, sales: 0, meetings: 0, users: summary.length });

  return { summary, totals, userIds: summary.map((r) => r.userId) };
}

// Column headers per list type (S.No is added by the client / row index).
const LIST_COLUMNS = {
  [LIST_TYPES.LEAD]: ["S.No", "Reference ID", "Name", "Contact No", "Email", "Prop Address", "Sales Person", "Created Date", "Updated Date", "Assignee"],
  [LIST_TYPES.OPPORTUNITIES]: ["S.No", "Reference ID", "Name", "Contact No", "Email", "Prop Address", "Status", "Sales Person", "Created Date", "Updated Date", "Assignee"],
  [LIST_TYPES.QUOTATION]: ["S.No", "Quot Ref No", "Name", "Contact No", "Email", "Prop Address", "Sales Person", "Created Date", "Updated Date", "Assignee"],
  [LIST_TYPES.SALES]: ["S.No", "Job Ref No", "Name", "Contact No", "Email", "Prop Address", "Status", "Sales Person", "Created Date", "Updated Date", "Assignee"],
  [LIST_TYPES.MEETING]: ["S.No", "Title", "Date", "Start Time", "End Time", "Customer", "Prop Address", "Sales Person", "Created Date", "Assignee"],
};

/**
 * Detail rows for the chosen list type, scoped to the same Role/User selection
 * (via the candidate assignee id set) and Period.
 */
async function getListReport({ type, userIds, roleFilterActive, window, showUpdated, showCustomerMeetingOnly, includeCancelled, includeArchived, page, limit, replacements }) {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
  const offset = (pageNum - 1) * limitNum;
  const hasWindow = !!window.start;

  // Constrain to the selected users. When Role/User narrowed the set, filter by
  // that id list; otherwise (all users) fall back to plain tenant scope.
  const rep = { ...replacements, listUserIds: userIds, limit: limitNum, offset };
  const assigneeScope = roleFilterActive ? "l.assignee_id = ANY(ARRAY[:listUserIds]::uuid[])" : "TRUE";

  let base;
  let selectCols;
  let orderBy;

  if (type === LIST_TYPES.QUOTATION) {
    selectCols = `q.reference_number AS "refNo", l.name, l.phone AS "contactNo", l.email, ${PROPERTY_ADDRESS_SQL} AS "propAddress", creator.name AS "salesPerson", q.created_at AS "createdDate", q.updated_at AS "updatedDate", assignee.name AS "assignee"`;
    base = `FROM quotation q JOIN leads l ON q.leads_id = l.leads_id ${LEAD_JOINS} WHERE ${leadScope()} AND ${assigneeScope} AND ${periodPredicate("q.created_at", "q.updated_at", showUpdated, hasWindow)}`;
    orderBy = "q.created_at DESC";
  } else if (type === LIST_TYPES.OPPORTUNITIES) {
    selectCols = `l.reference_number AS "refNo", l.name, l.phone AS "contactNo", l.email, ${PROPERTY_ADDRESS_SQL} AS "propAddress", o.status, creator.name AS "salesPerson", o.created_at AS "createdDate", o.updated_at AS "updatedDate", assignee.name AS "assignee"`;
    base = `FROM opportunity o JOIN leads l ON o.leads_id = l.leads_id ${LEAD_JOINS} WHERE ${leadScope()} AND ${assigneeScope} AND ${periodPredicate("o.created_at", "o.updated_at", showUpdated, hasWindow)}`;
    orderBy = "o.created_at DESC";
  } else if (type === LIST_TYPES.SALES) {
    const jobStatus = jobStatusPredicate(includeCancelled, includeArchived);
    selectCols = `j.reference_number AS "refNo", l.name, l.phone AS "contactNo", l.email, ${PROPERTY_ADDRESS_SQL} AS "propAddress", j.status, creator.name AS "salesPerson", j.created_at AS "createdDate", j.updated_at AS "updatedDate", assignee.name AS "assignee"`;
    base = `FROM job j JOIN opportunity o ON j.opportunity_id = o.opportunity_id JOIN leads l ON o.leads_id = l.leads_id ${LEAD_JOINS} WHERE ${leadScope()} AND ${assigneeScope} AND ${jobStatus} AND ${periodPredicate("j.created_at", "j.updated_at", showUpdated, hasWindow)}`;
    orderBy = "j.created_at DESC";
  } else if (type === LIST_TYPES.MEETING) {
    const customerMeeting = showCustomerMeetingOnly ? "AND ap.send_appointment_customer = true" : "";
    selectCols = `ap.title, ap.date, ap.start_time AS "startTime", ap.end_time AS "endTime", l.name AS "customer", ${PROPERTY_ADDRESS_SQL} AS "propAddress", creator.name AS "salesPerson", ap.created_at AS "createdDate", assignee.name AS "assignee"`;
    base = `FROM appointment ap JOIN leads l ON ap.lead_id = l.leads_id ${LEAD_JOINS} WHERE ap.is_deleted = false ${customerMeeting} AND ${leadScope()} AND ${assigneeScope} AND ${periodPredicate("ap.created_at", "ap.updated_at", showUpdated, hasWindow)}`;
    orderBy = "ap.date DESC, ap.start_time DESC";
  } else {
    // LEAD (default)
    selectCols = `l.reference_number AS "refNo", l.name, l.phone AS "contactNo", l.email, ${PROPERTY_ADDRESS_SQL} AS "propAddress", creator.name AS "salesPerson", l.created_at AS "createdDate", l.updated_at AS "updatedDate", assignee.name AS "assignee"`;
    base = `FROM leads l ${LEAD_JOINS} WHERE ${leadScope()} AND ${assigneeScope} AND ${periodPredicate("l.created_at", "l.updated_at", showUpdated, hasWindow)}`;
    orderBy = "l.created_at DESC";
  }

  const dataQuery = `SELECT ${selectCols} ${base} ORDER BY ${orderBy} LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total ${base}`;

  const [rows, countRows] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements: rep, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements: rep, type: QueryTypes.SELECT }),
  ]);

  const total = countRows[0]?.total || 0;
  return {
    type,
    columns: LIST_COLUMNS[type] || LIST_COLUMNS[LIST_TYPES.LEAD],
    rows: rows.map((r, i) => ({ sNo: offset + i + 1, ...keysToCamelCase(r) })),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

/**
 * Main entry: per-user summary matrix, plus an optional detail list.
 */
export async function getPerformanceReport({ builderId, companyId, filters = {} }) {
  const {
    role_id: roleId,
    user_id: userId,
    period,
    start_date: startDate,
    end_date: endDate,
    show_updated: showUpdatedRaw,
    show_customer_meeting_only: customerMeetingRaw,
    list_report: listReportRaw,
    include_cancelled_jobs: cancelledRaw,
    include_archived_jobs: archivedRaw,
    page,
    limit,
  } = filters;

  const showUpdated = showUpdatedRaw === true || showUpdatedRaw === "true";
  const showCustomerMeetingOnly = customerMeetingRaw === true || customerMeetingRaw === "true";
  const includeCancelled = cancelledRaw === true || cancelledRaw === "true";
  const includeArchived = archivedRaw === true || archivedRaw === "true";

  const listType = String(listReportRaw || LIST_TYPES.NONE).toLowerCase();
  const window = resolvePeriod(period, startDate, endDate);

  const replacements = {
    builderId: builderId || null,
    companyId: companyId || null,
    roleId: roleId || null,
    userId: userId || null,
    // Bound once — every alias `leadScope()` / `userScope()` writes uses the
    // same named parameter.
    ...sampleDataSqlScope("l").replacements,
  };
  if (window.start) {
    replacements.pStart = window.start.toISOString();
  }
  // When only a start exists (relative ranges), the window runs to "now".
  replacements.pEnd = (window.end || new Date()).toISOString();

  const { summary, totals, userIds } = await getSummary({
    roleId, userId, window, showUpdated,
    showCustomerMeetingOnly, includeCancelled, includeArchived, replacements,
  });

  let listReport = null;
  if (listType && listType !== LIST_TYPES.NONE) {
    listReport = await getListReport({
      type: listType,
      userIds,
      roleFilterActive: !!(roleId || userId),
      window, showUpdated, showCustomerMeetingOnly, includeCancelled, includeArchived,
      page, limit, replacements,
    });
  }

  return {
    period: { label: window.label, start: window.start, end: window.end },
    filters: { roleId: roleId || null, userId: userId || null, showUpdated, showCustomerMeetingOnly, includeCancelled, includeArchived, listReport: listType },
    summary,
    totals,
    listReport,
  };
}

export default { getPerformanceReport, resolvePeriod };
