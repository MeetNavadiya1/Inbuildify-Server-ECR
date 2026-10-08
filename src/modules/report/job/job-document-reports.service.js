import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { applyColumnSearchFilters, applySampleDataScope } from "../report-filter.util.js";

/**
 * Job → document reports.
 *   - Contract Report: one row per building_contract (job contract).
 *   - Extension Notice Report: one row per job_delay (delay/extension notice).
 */

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

// Shared job → lead joins; the base table (aliased `src`) must expose job_id.
const JOB_LEAD_JOINS = `
        JOIN job j ON src.job_id = j.job_id
        LEFT JOIN opportunity o ON j.opportunity_id = o.opportunity_id
        LEFT JOIN leads l ON o.leads_id = l.leads_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        LEFT JOIN users sup ON j.supervisor_id = sup.users_id`;

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

async function runReport(dataQuery, countQuery, replacements) {
  const [rows, countRows] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
  ]);
  return { rows: rows.map((r) => keysToCamelCase(r)), total: countRows[0]?.total || 0 };
}

// ─── Contract Report ────────────────────────────────────────────────────────
export const CONTRACT_REPORT_COLUMNS = [
  { key: "referenceId", label: "Reference ID", sortable: true },
  { key: "customerName", label: "Customer Name", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "preparedDate", label: "Prepared Date", sortable: true },
  { key: "signedDate", label: "Signed Date", sortable: true },
  { key: "assignee", label: "Assignee" },
  { key: "siteSupervisor", label: "Site Supervisor" },
];

export async function getContractReport({ builderId, companyId, user = null, filters = {} }) {
  const { pageNum, limitNum, offset } = paginate(filters);
  const { search, supervisor_id, signed, sort_by = "preparedDate", sort_order = "desc" } = filters;

  const where = ["(src.builder_id = :builderId OR (src.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");

  if (supervisor_id?.length) {
    where.push("j.supervisor_id = ANY(ARRAY[:supervisorId]::uuid[])"); replacements.supervisorId = supervisor_id;
  }
  if (signed === "true" || signed === true) {
    where.push("src.contract_signed_date IS NOT NULL");
  } else if (signed === "false" || signed === false) {
    where.push("src.contract_signed_date IS NULL");
  }
  if (search) {
    where.push(`(j.reference_number ILIKE :search OR l.name ILIKE :search OR l.email ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "j.reference_number",
    customer_name: "l.name",
    job_address: PROPERTY_ADDRESS_SQL,
    email: "l.email",
    phone: "l.phone",
  });
  applyJobScope(user, where, replacements);

  const whereClause = where.join(" AND ");
  const sortable = { referenceId: "j.reference_number", customerName: "l.name", preparedDate: "src.created_at", signedDate: "src.contract_signed_date" };
  const orderCol = sortable[sort_by] || "src.created_at";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const dataQuery = `
        SELECT
          j.reference_number AS "referenceId", l.name AS "customerName", ${PROPERTY_ADDRESS_SQL} AS "jobAddress",
          l.email AS "email", l.phone AS "phone",
          src.created_at AS "preparedDate", src.contract_signed_date AS "signedDate",
          assignee.name AS "assignee", sup.name AS "siteSupervisor"
        FROM building_contracts src
        ${JOB_LEAD_JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total FROM building_contracts src ${JOB_LEAD_JOINS} WHERE ${whereClause}`;

  const { rows, total } = await runReport(dataQuery, countQuery, replacements);
  return { columns: CONTRACT_REPORT_COLUMNS, rows, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } };
}

// ─── Extension Notice Report ────────────────────────────────────────────────
export const EXTENSION_NOTICE_COLUMNS = [
  { key: "referenceId", label: "Reference ID", sortable: true },
  { key: "customerName", label: "Customer Name", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "reason", label: "Reason" },
  { key: "days", label: "Days", sortable: true },
  { key: "startDate", label: "Start Date", sortable: true },
  { key: "endDate", label: "End Date", sortable: true },
  { key: "createdDate", label: "Created Date", sortable: true },
  { key: "created", label: "Created" },
];

export async function getExtensionNoticeReport({ builderId, companyId, user = null, filters = {} }) {
  const { pageNum, limitNum, offset } = paginate(filters);
  const { search, reason, sort_by = "createdDate", sort_order = "desc" } = filters;

  const where = ["(src.builder_id = :builderId OR (src.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");

  if (reason) {
    where.push("src.reason = :reason"); replacements.reason = reason;
  }
  if (search) {
    where.push(`(j.reference_number ILIKE :search OR l.name ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "j.reference_number",
    customer_name: "l.name",
    job_address: PROPERTY_ADDRESS_SQL,
  });
  applyJobScope(user, where, replacements);

  const whereClause = where.join(" AND ");
  const sortable = { referenceId: "j.reference_number", customerName: "l.name", days: "src.no_of_days", startDate: "src.from_date", endDate: "src.to_date", createdDate: "src.created_at" };
  const orderCol = sortable[sort_by] || "src.created_at";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const dataQuery = `
        SELECT
          j.reference_number AS "referenceId", l.name AS "customerName", ${PROPERTY_ADDRESS_SQL} AS "jobAddress",
          src.reason AS "reason", src.no_of_days AS "days", src.from_date AS "startDate", src.to_date AS "endDate",
          src.created_at AS "createdDate", creator.name AS "created"
        FROM job_delay src
        ${JOB_LEAD_JOINS}
        LEFT JOIN users creator ON src.created_by = creator.users_id
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total FROM job_delay src ${JOB_LEAD_JOINS} WHERE ${whereClause}`;

  const { rows, total } = await runReport(dataQuery, countQuery, replacements);
  return { columns: EXTENSION_NOTICE_COLUMNS, rows, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } };
}

export default { getContractReport, getExtensionNoticeReport };
