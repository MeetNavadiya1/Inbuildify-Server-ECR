import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { applyColumnSearchFilters, applySampleDataScope } from "../report-filter.util.js";

/**
 * Sales → No Action Leads report.
 *
 * Leads that have never been actioned — no notes, tasks, appointments, or SMS
 * logged against them. Fixed 9-column set (no customization, no custom fields).
 *
 * "On Hold" leads are excluded by default and included via `include_on_hold`.
 * The schema has no dedicated on-hold flag yet, so this filters on a
 * `status = 'On Hold'` value; it's a harmless no-op until such leads exist and
 * is the single place to adjust once on-hold is modelled.
 */

const ON_HOLD_STATUS = "On Hold";

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

const LEAD_STATUS_SQL = "COALESCE((SELECT o.status FROM opportunity o WHERE o.leads_id = l.leads_id LIMIT 1), l.status)";

// A lead is "no action" when none of these action records reference it.
const NO_ACTION_SQL = `
        NOT EXISTS (SELECT 1 FROM notes n WHERE n.leads_id = l.leads_id)
        AND NOT EXISTS (SELECT 1 FROM task t WHERE t.lead_id = l.leads_id)
        AND NOT EXISTS (SELECT 1 FROM appointment ap WHERE ap.lead_id = l.leads_id AND ap.is_deleted = false)
        AND NOT EXISTS (SELECT 1 FROM sms sm WHERE sm.leads_id = l.leads_id)`;

const COLUMNS = [
  { key: "referenceId", label: "Reference ID", select: "l.reference_number", sortColumn: "l.reference_number" },
  { key: "name", label: "Name", select: "l.name", sortColumn: "l.name" },
  { key: "contact", label: "Contact", select: "l.phone", sortColumn: null },
  { key: "email", label: "Email", select: "l.email", sortColumn: "l.email" },
  { key: "propertyAddress", label: "Property Address", select: PROPERTY_ADDRESS_SQL, sortColumn: null },
  { key: "leadCreatedDate", label: "Lead Created Date", select: "l.created_at", sortColumn: "l.created_at" },
  { key: "leadStatus", label: "Lead Status", select: LEAD_STATUS_SQL, sortColumn: "l.status" },
  { key: "assignee", label: "Assignee", select: "assignee.name", sortColumn: "assignee.name" },
  { key: "lastUpdatedDate", label: "Last Updated Date", select: "l.updated_at", sortColumn: "l.updated_at" },
];

const SORTABLE = COLUMNS.reduce((acc, c) => {
  if (c.sortColumn) {
    acc[c.key] = c.sortColumn;
  }
  return acc;
}, {});

export const NO_ACTION_REPORT_COLUMNS = COLUMNS.map((c) => ({ key: c.key, label: c.label, sortable: !!c.sortColumn }));

function resolveDateRange(createdAt) {
  const now = new Date();
  let start;
  let end;
  switch (String(createdAt).toLowerCase()) {
  case "today": start = new Date(now.setHours(0, 0, 0, 0)); break;
  case "yesterday":
    start = new Date(new Date().setHours(0, 0, 0, 0) - 24 * 60 * 60 * 1000);
    end = new Date(new Date().setHours(0, 0, 0, 0));
    break;
  case "last_7_days": start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
  case "last_15_days": start = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); break;
  case "last_30_days": start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
  case "last_3_months": start = new Date(now.getFullYear(), now.getMonth() - 3, 1); break;
  case "last_6_months": start = new Date(now.getFullYear(), now.getMonth() - 6, 1); break;
  case "last_1_year": start = new Date(now.getFullYear() - 1, now.getMonth(), 1); break;
  }
  return { start, end };
}

/**
 * Fetch paginated No Action Leads for a builder/company.
 *
 * @param {object} args
 * @param {string} args.builderId
 * @param {string} args.companyId
 * @param {object} args.user   - req.user (needs role_name for row scoping)
 * @param {object} args.filters
 */
export async function getNoActionReport({ builderId, companyId, user = null, filters = {} }) {
  const {
    page = 1,
    limit = 25,
    search,
    status,
    lead_source_id,
    assignee_id,
    created_at,
    created_from,
    created_to,
    include_on_hold,
    sort_by = "leadCreatedDate",
    sort_order = "desc",
  } = filters;

  const includeOnHold = include_on_hold === true || include_on_hold === "true";

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
  const offset = (pageNum - 1) * limitNum;

  const where = ["(l.builder_id = :builderId OR (l.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "l");

  // Core: no action records against the lead.
  where.push(`(${NO_ACTION_SQL})`);

  // On Hold leads excluded unless the toggle is on.
  if (!includeOnHold) {
    where.push("l.status IS DISTINCT FROM :onHoldStatus");
    replacements.onHoldStatus = ON_HOLD_STATUS;
  }

  if (created_from || created_to) {
    if (created_from) {
      where.push("l.created_at >= :createdFrom"); replacements.createdFrom = new Date(created_from).toISOString();
    }
    if (created_to) {
      where.push("l.created_at <= :createdTo"); replacements.createdTo = new Date(created_to).toISOString();
    }
  } else if (created_at) {
    const { start, end } = resolveDateRange(created_at);
    if (start && end) {
      where.push("l.created_at >= :dateStart AND l.created_at < :dateEnd");
      replacements.dateStart = start.toISOString();
      replacements.dateEnd = end.toISOString();
    } else if (start) {
      where.push("l.created_at >= :dateStart");
      replacements.dateStart = start.toISOString();
    }
  }

  if (status) {
    where.push("l.status = :status"); replacements.status = status;
  }
  if (lead_source_id?.length) {
    where.push("l.lead_source_id = ANY(ARRAY[:leadSourceId]::uuid[])"); replacements.leadSourceId = lead_source_id;
  }
  if (assignee_id?.length) {
    where.push("l.assignee_id = ANY(ARRAY[:assigneeId]::uuid[])"); replacements.assigneeId = assignee_id;
  }
  if (search) {
    where.push("(l.name ILIKE :search OR l.email ILIKE :search OR l.phone ILIKE :search OR l.reference_number ILIKE :search)");
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "l.reference_number",
    name: "l.name",
    email: "l.email",
    contact: "l.phone",
  });

  // Row-level scoping: Sales Executive → own assigned; Agent → own created.
  if (user?.role_name === ROLES.SALES_EXECUTIVE) {
    where.push("l.assignee_id = :scopeUserId"); replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.AGENT) {
    where.push("l.created_by = :scopeUserId"); replacements.scopeUserId = user.users_id || user.id;
  }

  const whereClause = where.join(" AND ");
  const orderColumn = SORTABLE[sort_by] || "l.created_at";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";
  const selectList = COLUMNS.map((c) => `${c.select} AS "${c.key}"`).join(",\n          ");

  const fromAndJoins = `
        FROM leads l
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        WHERE ${whereClause}`;

  const dataQuery = `
        SELECT
          l.leads_id AS "leadsId",
          ${selectList}
        ${fromAndJoins}
        ORDER BY ${orderColumn} ${orderDir} NULLS LAST, l.updated_at DESC NULLS LAST
        LIMIT :limit OFFSET :offset`;

  const countQuery = `SELECT COUNT(*)::int AS total FROM leads l WHERE ${whereClause}`;

  const [rows, countRows] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
  ]);

  const total = countRows[0]?.total || 0;

  return {
    columns: NO_ACTION_REPORT_COLUMNS,
    rows: rows.map((r) => keysToCamelCase(r)),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

export default { getNoActionReport };
