import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { applyColumnSearchFilters, applySampleDataScope } from "../report-filter.util.js";
import { grandTotalSql } from "../../../utils/quotationTotals.sql.js";

/**
 * Sales → Quotation report.
 *
 * One row per quotation, enriched from its parent lead and its "current"
 * version (latest approved, else latest by version number). Unlike the
 * Focus report this report has no column customization, so the column set is
 * fixed; the definitions are still returned to the client for the header row.
 */

// A quotation's driving version: prefer the latest approved, else the latest.
const CURRENT_VERSION_LATERAL = `
        LEFT JOIN LATERAL (
          SELECT qv.quotation_version_id, qv.dwelling_type_id, qv.location_id,
                 qv.structure_engineer_price, qv.facade_price
          FROM quotation_version qv
          WHERE qv.quotation_id = q.quotation_id
          ORDER BY qv.is_approve DESC, qv.quotation_version_no DESC NULLS LAST
          LIMIT 1
        ) cv ON true`;

// Grand total of the driving version: package cost + price-list lines +
// structure-engineer + facade. Shared with the quotation PDF, the CRM screen and
// the job reports — see utils/quotationTotals.sql.js.
const TOTAL_COST_SQL = grandTotalSql("cv.quotation_version_id", "cv");

const CONTACT_ADDRESS_SQL = `(
          SELECT NULLIF(TRIM(CONCAT_WS(', ',
            NULLIF(TRIM(COALESCE(ad.address_line1, '')), ''),
            NULLIF(TRIM(COALESCE(ad.address_line2, '')), ''),
            NULLIF(TRIM(COALESCE(ad.city, '')), ''),
            NULLIF(TRIM(COALESCE(cst.name, '')), ''),
            NULLIF(TRIM(COALESCE(ad.zip_code, '')), ''))), '')
          FROM leads_contact_map lcm
          JOIN users cu ON lcm.contact_id = cu.users_id
          LEFT JOIN address ad ON cu.address_id = ad.address_id
          LEFT JOIN state cst ON ad.state_id = cst.state_id
          WHERE lcm.leads_id = l.leads_id
          ORDER BY lcm.id ASC
          LIMIT 1
        )`;

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

const APPROVED_MAX_SQL = "(SELECT MAX(qv.updated_at) FROM quotation_version qv WHERE qv.quotation_id = q.quotation_id AND qv.is_approve = true)";
const APPROVED_MIN_SQL = "(SELECT MIN(qv.updated_at) FROM quotation_version qv WHERE qv.quotation_id = q.quotation_id AND qv.is_approve = true)";
const STATUS_SQL = "CASE WHEN EXISTS (SELECT 1 FROM quotation_version qv WHERE qv.quotation_id = q.quotation_id AND qv.is_approve = true) THEN 'Approved' ELSE 'Draft' END";

// Column catalog (fixed order). `select` is aliased to `key`; `sortColumn` is
// the ORDER BY whitelist entry (null = not sortable). `label` is empty-safe /
// best-effort for `label` (no clean source in the current schema).
const QUOTATION_COLUMNS = [
  { key: "referenceId", label: "Reference ID", select: "q.reference_number", sortColumn: "q.reference_number" },
  { key: "leadJobRefId", label: "Lead/Job Ref ID", select: "l.reference_number", sortColumn: "l.reference_number" },
  { key: "name", label: "Name", select: "l.name", sortColumn: "l.name" },
  { key: "phone", label: "Phone", select: "l.phone", sortColumn: null },
  { key: "email", label: "Email", select: "l.email", sortColumn: "l.email" },
  { key: "leadSource", label: "Lead Source", select: "ls.name", sortColumn: "ls.name" },
  { key: "createdDate", label: "Created Date", select: "q.created_at", sortColumn: "q.created_at" },
  { key: "latestApprovedDate", label: "Latest Approved Date", select: APPROVED_MAX_SQL, sortColumn: null },
  { key: "contactAddress", label: "Contact Address", select: CONTACT_ADDRESS_SQL, sortColumn: null },
  { key: "propertyAddress", label: "Property Address", select: PROPERTY_ADDRESS_SQL, sortColumn: null },
  { key: "totalCost", label: "Total Cost $", select: TOTAL_COST_SQL, sortColumn: null },
  { key: "dwellingType", label: "Dwelling Type", select: "dt.name", sortColumn: null },
  { key: "estate", label: "Estate", select: "COALESCE(pd.estate_name, est.name)", sortColumn: null },
  { key: "landTitleDate", label: "Land Title Date", select: "pd.title_date", sortColumn: null },
  { key: "assignee", label: "Assignee", select: "assignee.name", sortColumn: "assignee.name" },
  { key: "reportingManager", label: "Reporting Manager", select: "manager.name", sortColumn: null },
  { key: "location", label: "Location", select: "loc.name", sortColumn: null },
  { key: "label", label: "Label", select: "NULL::text", sortColumn: null },
  { key: "status", label: "Status", select: STATUS_SQL, sortColumn: null },
  { key: "firstApprovedDate", label: "First Approved Date", select: APPROVED_MIN_SQL, sortColumn: null },
];

const SORTABLE = QUOTATION_COLUMNS.reduce((acc, c) => {
  if (c.sortColumn) {
    acc[c.key] = c.sortColumn;
  }
  return acc;
}, {});

// Column header definitions for the client (no customization on this report).
export const QUOTATION_REPORT_COLUMNS = QUOTATION_COLUMNS.map((c) => ({
  key: c.key,
  label: c.label,
  sortable: !!c.sortColumn,
}));

function resolveDateRange(createdAt) {
  const now = new Date();
  let start;
  let end;
  switch (String(createdAt).toLowerCase()) {
  case "last_15_minutes": start = new Date(now.getTime() - 15 * 60 * 1000); break;
  case "last_1_hour": start = new Date(now.getTime() - 60 * 60 * 1000); break;
  case "last_2_hours": start = new Date(now.getTime() - 2 * 60 * 60 * 1000); break;
  case "last_24_hours": start = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
  case "today": start = new Date(now.setHours(0, 0, 0, 0)); break;
  case "yesterday":
    start = new Date(new Date().setHours(0, 0, 0, 0) - 24 * 60 * 60 * 1000);
    end = new Date(new Date().setHours(0, 0, 0, 0));
    break;
  case "last_7_days": start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
  case "last_15_days": start = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); break;
  case "last_30_days": start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
  }
  return { start, end };
}

/**
 * Fetch paginated Quotation report rows for a builder/company.
 *
 * @param {object} args
 * @param {string} args.builderId
 * @param {string} args.companyId
 * @param {object} args.user   - req.user (needs role_name for row scoping)
 * @param {object} args.filters
 */
export async function getQuotationReport({ builderId, companyId, user = null, filters = {} }) {
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
    sort_by = "createdDate",
    sort_order = "desc",
  } = filters;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
  const offset = (pageNum - 1) * limitNum;

  // Quotations inherit tenant scope from their parent lead.
  const where = ["(l.builder_id = :builderId OR (l.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "l");

  if (created_from || created_to) {
    if (created_from) {
      where.push("q.created_at >= :createdFrom");
      replacements.createdFrom = new Date(created_from).toISOString();
    }
    if (created_to) {
      where.push("q.created_at <= :createdTo");
      replacements.createdTo = new Date(created_to).toISOString();
    }
  } else if (created_at) {
    const { start, end } = resolveDateRange(created_at);
    if (start && end) {
      where.push("q.created_at >= :dateStart AND q.created_at < :dateEnd");
      replacements.dateStart = start.toISOString();
      replacements.dateEnd = end.toISOString();
    } else if (start) {
      where.push("q.created_at >= :dateStart");
      replacements.dateStart = start.toISOString();
    }
  }

  if (status) {
    if (String(status).toLowerCase() === "approved") {
      where.push("EXISTS (SELECT 1 FROM quotation_version qv WHERE qv.quotation_id = q.quotation_id AND qv.is_approve = true)");
    } else {
      where.push("NOT EXISTS (SELECT 1 FROM quotation_version qv WHERE qv.quotation_id = q.quotation_id AND qv.is_approve = true)");
    }
  }
  if (lead_source_id?.length) {
    where.push("l.lead_source_id = ANY(ARRAY[:leadSourceId]::uuid[])");
    replacements.leadSourceId = lead_source_id;
  }
  if (assignee_id?.length) {
    where.push("l.assignee_id = ANY(ARRAY[:assigneeId]::uuid[])");
    replacements.assigneeId = assignee_id;
  }
  if (search) {
    where.push("(q.reference_number ILIKE :search OR l.reference_number ILIKE :search OR l.name ILIKE :search OR l.email ILIKE :search OR l.phone ILIKE :search)");
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "q.reference_number",
    lead_job_ref: "l.reference_number",
    name: "l.name",
    email: "l.email",
    phone: "l.phone",
  });

  // Row-level scoping: Sales Executive → own assigned leads; Agent → own created.
  if (user?.role_name === ROLES.SALES_EXECUTIVE) {
    where.push("l.assignee_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.AGENT) {
    where.push("l.created_by = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  }

  const whereClause = where.join(" AND ");
  const orderColumn = SORTABLE[sort_by] || "q.created_at";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const selectList = QUOTATION_COLUMNS.map((c) => `${c.select} AS "${c.key}"`).join(",\n          ");

  const fromAndJoins = `
        FROM quotation q
        JOIN leads l ON q.leads_id = l.leads_id
        LEFT JOIN lead_source ls ON l.lead_source_id = ls.lead_source_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        LEFT JOIN users manager ON assignee.reporting_to = manager.users_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN estate est ON pd.estate_id = est.estate_id
        ${CURRENT_VERSION_LATERAL}
        LEFT JOIN dwelling_type dt ON cv.dwelling_type_id = dt.dwelling_type_id
        LEFT JOIN location loc ON cv.location_id = loc.location_id
        WHERE ${whereClause}`;

  const dataQuery = `
        SELECT
          q.quotation_id AS "quotationId",
          l.is_sample_data AS "isSampleData",
          ${selectList}
        ${fromAndJoins}
        ORDER BY ${orderColumn} ${orderDir} NULLS LAST, q.created_at DESC NULLS LAST
        LIMIT :limit OFFSET :offset`;

  const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM quotation q
        JOIN leads l ON q.leads_id = l.leads_id
        WHERE ${whereClause}`;

  const [rows, countRows] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
  ]);

  const total = countRows[0]?.total || 0;

  return {
    columns: QUOTATION_REPORT_COLUMNS,
    rows: rows.map((r) => keysToCamelCase(r)),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

export default { getQuotationReport };
