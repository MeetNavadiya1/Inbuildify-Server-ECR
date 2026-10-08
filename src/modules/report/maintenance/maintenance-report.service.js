import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { applyColumnSearchFilters, applySampleDataScope } from "../report-filter.util.js";

/**
 * Maintenance reports (post-handover warranty).
 *
 *   maintenance (1 per job) → maintenance_request (the "MR" requests) → tasks
 *
 *   - Maintenance Report (summary): one row per maintenance/job with request
 *     counts by status (Pending / Completed / On Hold).
 *   - Maintenance Detailed Report: one row per request, with its task counts.
 *
 * Request statuses are Pending / On Hold / Completed (maintenance.validation).
 * No column customization / custom fields on these reports.
 */

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

// Job/lead joins shared by both reports (maintenance → job → opportunity → lead).
const JOB_LEAD_JOINS = `
        JOIN job j ON m.job_id = j.job_id
        LEFT JOIN opportunity o ON j.opportunity_id = o.opportunity_id
        LEFT JOIN leads l ON o.leads_id = l.leads_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN users sup ON m.supervisor_id = sup.users_id`;

export const MAINTENANCE_SUMMARY_COLUMNS = [
  { key: "referenceId", label: "Reference ID", sortable: true },
  { key: "customerName", label: "Customer Name", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "startDate", label: "Start Date", sortable: true },
  { key: "endDate", label: "End Date" },
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" },
  { key: "onHold", label: "On Hold" },
  { key: "supervisorName", label: "Supervisor Name", sortable: true },
];

export const MAINTENANCE_DETAILED_COLUMNS = [
  { key: "referenceId", label: "Reference ID", sortable: true },
  { key: "customerName", label: "Customer Name", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "startDate", label: "Start Date", sortable: true },
  { key: "endDate", label: "End Date" },
  { key: "completedTask", label: "Completed Task" },
  { key: "pendingTask", label: "Pending Task" },
  { key: "supplier", label: "Supplier", sortable: true },
  { key: "supervisor", label: "Supervisor" },
  { key: "requestStatus", label: "Request Status", sortable: true },
  { key: "noOfTask", label: "No of Task" },
  { key: "notes", label: "Notes" },
];

// Row-level scoping predicates on the maintenance table, mirroring
// MAINTENANCE_SCOPE_COLUMNS: Site Supervisor → own; Contact → own job.
function applyMaintenanceScope(user, where, replacements) {
  if (user?.role_name === ROLES.SITE_SUPERVISOR) {
    where.push("m.supervisor_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.CONTACT) {
    where.push("m.customer_contact_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  }
}

function paginate(filters) {
  const pageNum = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(filters.limit, 10) || 25, 1), 200);
  return { pageNum, limitNum, offset: (pageNum - 1) * limitNum };
}

/**
 * Maintenance Report (summary) — one row per maintenance/job.
 */
export async function getMaintenanceSummaryReport({ builderId, companyId, user = null, filters = {} }) {
  const { pageNum, limitNum, offset } = paginate(filters);
  const { search, supervisor_id, status, sort_by = "referenceId", sort_order = "desc", maintenance_id } = filters;

  const where = ["(m.builder_id = :builderId OR (m.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");

  if (maintenance_id) {
    where.push("m.maintenance_id = :maintenance_id");
    replacements.maintenance_id = maintenance_id;
  }

  if (status) {
    where.push("m.status = :status"); replacements.status = status;
  }
  if (supervisor_id?.length) {
    where.push("m.supervisor_id = ANY(ARRAY[:supervisorId]::uuid[])"); replacements.supervisorId = supervisor_id;
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
  applyMaintenanceScope(user, where, replacements);

  const whereClause = where.join(" AND ");
  const sortable = { referenceId: "j.reference_number", customerName: "l.name", startDate: "m.handover_date", supervisorName: "sup.name" };
  const orderColumn = sortable[sort_by] || "j.reference_number";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  // Request-count subqueries keep the query GROUP-BY-free.
  const reqCount = (st) => `(SELECT COUNT(*)::int FROM maintenance_request mr WHERE mr.maintenance_id = m.maintenance_id AND mr.status = '${st}')`;

  const dataQuery = `
        SELECT
          m.maintenance_id AS "maintenanceId",
          j.is_sample_data AS "isSampleData",
          j.reference_number AS "referenceId",
          l.name AS "customerName",
          ${PROPERTY_ADDRESS_SQL} AS "jobAddress",
          m.handover_date AS "startDate",
          CASE WHEN m.handover_date IS NOT NULL
               THEN (m.handover_date + (COALESCE(ms.maintenance_period_days, 0) * INTERVAL '1 day'))::date
               ELSE NULL END AS "endDate",
          ${reqCount("Pending")} AS "pending",
          ${reqCount("Completed")} AS "completed",
          ${reqCount("On Hold")} AS "onHold",
          sup.name AS "supervisorName"
        FROM maintenance m
        ${JOB_LEAD_JOINS}
        LEFT JOIN maintenance_settings ms ON (ms.builder_id = m.builder_id OR (ms.company_id = m.company_id AND m.company_id IS NOT NULL))
        WHERE ${whereClause}
        ORDER BY ${orderColumn} ${orderDir} NULLS LAST, m.created_at DESC
        LIMIT :limit OFFSET :offset`;

  const countQuery = `SELECT COUNT(*)::int AS total FROM maintenance m ${JOB_LEAD_JOINS} WHERE ${whereClause}`;

  const [rows, countRows] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
  ]);

  const total = countRows[0]?.total || 0;
  return {
    columns: MAINTENANCE_SUMMARY_COLUMNS,
    rows: rows.map((r) => keysToCamelCase(r)),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

/**
 * Maintenance Detailed Report — one row per maintenance request.
 */
export async function getMaintenanceDetailedReport({ builderId, companyId, user = null, filters = {} }) {
  const { pageNum, limitNum, offset } = paginate(filters);
  const { search, supervisor_id, status, supplier, sort_by = "referenceId", sort_order = "desc", maintenance_id } = filters;

  const where = ["(m.builder_id = :builderId OR (m.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");

  if (maintenance_id) {
    where.push("m.maintenance_id = :maintenance_id");
    replacements.maintenance_id = maintenance_id;
  }

  if (status) {
    where.push("mr.status = :status"); replacements.status = status;
  }
  if (supplier) {
    where.push("mr.supplier ILIKE :supplier"); replacements.supplier = `%${supplier}%`;
  }
  if (supervisor_id?.length) {
    where.push("m.supervisor_id = ANY(ARRAY[:supervisorId]::uuid[])"); replacements.supervisorId = supervisor_id;
  }
  if (search) {
    where.push(`(mr.reference_number ILIKE :search OR j.reference_number ILIKE :search OR l.name ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "mr.reference_number",
    customer_name: "l.name",
    job_address: PROPERTY_ADDRESS_SQL,
  });
  applyMaintenanceScope(user, where, replacements);

  const whereClause = where.join(" AND ");
  const sortable = { referenceId: "mr.reference_number", customerName: "l.name", startDate: "mr.start_date", requestStatus: "mr.status", supplier: "mr.supplier" };
  const orderColumn = sortable[sort_by] || "mr.reference_number";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const taskCount = (cond) => `(SELECT COUNT(*)::int FROM maintenance_request_task t WHERE t.maintenance_request_id = mr.maintenance_request_id${cond})`;

  const dataQuery = `
        SELECT
          mr.maintenance_request_id AS "maintenanceRequestId",
          j.is_sample_data AS "isSampleData",
          mr.reference_number AS "referenceId",
          l.name AS "customerName",
          ${PROPERTY_ADDRESS_SQL} AS "jobAddress",
          mr.start_date AS "startDate",
          mr.finish_date AS "endDate",
          ${taskCount(" AND t.is_completed = true")} AS "completedTask",
          ${taskCount(" AND t.is_completed = false")} AS "pendingTask",
          mr.supplier,
          sup.name AS "supervisor",
          mr.status AS "requestStatus",
          ${taskCount("")} AS "noOfTask",
          mr.notes
        FROM maintenance_request mr
        JOIN maintenance m ON mr.maintenance_id = m.maintenance_id
        ${JOB_LEAD_JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderColumn} ${orderDir} NULLS LAST, mr.created_at DESC
        LIMIT :limit OFFSET :offset`;

  const countQuery = `SELECT COUNT(*)::int AS total FROM maintenance_request mr JOIN maintenance m ON mr.maintenance_id = m.maintenance_id ${JOB_LEAD_JOINS} WHERE ${whereClause}`;

  const [rows, countRows] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
  ]);

  const total = countRows[0]?.total || 0;
  return {
    columns: MAINTENANCE_DETAILED_COLUMNS,
    rows: rows.map((r) => keysToCamelCase(r)),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

export default { getMaintenanceSummaryReport, getMaintenanceDetailedReport };
