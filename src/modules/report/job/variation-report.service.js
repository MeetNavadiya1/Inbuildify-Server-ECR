import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { applyColumnSearchFilters, applySampleDataScope } from "../report-filter.util.js";

/**
 * Job → Variation report. One row per job_variation.
 *
 * The variation model tracks a single `status` plus document/date fields rather
 * than a discrete date per workflow step, so the sample's Sent/Signed/Invoice
 * columns are derived best-effort:
 *   Variation Sent   → variation_date
 *   Variation Signed → approved_at (else signed_document presence)
 *   Invoice Created  → invoice_id present
 *   Invoice Sent     → invoice_document present
 *   Payment          → linked invoice's deposit amount
 *   Extension Sent   → delayed_days > 0
 */

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

const JOINS = `
        FROM job_variation jv
        JOIN job j ON jv.job_id = j.job_id
        LEFT JOIN opportunity o ON j.opportunity_id = o.opportunity_id
        LEFT JOIN leads l ON o.leads_id = l.leads_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN users creator ON jv.created_by = creator.users_id
        LEFT JOIN invoice iv ON jv.invoice_id = iv.invoice_id`;

export const VARIATION_REPORT_COLUMNS = [
  { key: "variationId", label: "Variation ID", sortable: true },
  { key: "name", label: "Name", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status", sortable: true },
  { key: "variationSent", label: "Variation Sent" },
  { key: "variationSigned", label: "Variation Signed" },
  { key: "invoiceCreated", label: "Invoice Created" },
  { key: "invoiceSent", label: "Invoice Sent" },
  { key: "amount", label: "Amount", sortable: true },
  { key: "payment", label: "Payment" },
  { key: "extensionSent", label: "Extension Sent" },
  { key: "createdDate", label: "Created Date", sortable: true },
  { key: "createdUser", label: "Created User" },
];

function applyJobScope(user, where, replacements) {
  if (user?.role_name === ROLES.SITE_SUPERVISOR) {
    where.push("j.supervisor_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.CONTACT) {
    where.push("j.customer_contact_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  }
}

export async function getVariationReport({ builderId, companyId, user = null, filters = {} }) {
  const pageNum = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(filters.limit, 10) || 25, 1), 200);
  const offset = (pageNum - 1) * limitNum;
  const { search, status, supervisor_id, sort_by = "createdDate", sort_order = "desc" } = filters;

  const where = ["(jv.builder_id = :builderId OR (jv.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");

  if (status) {
    where.push("jv.status = :status"); replacements.status = status;
  }
  if (supervisor_id?.length) {
    where.push("j.supervisor_id = ANY(ARRAY[:supervisorId]::uuid[])"); replacements.supervisorId = supervisor_id;
  }
  if (search) {
    where.push(`(jv.reference_id ILIKE :search OR jv.title ILIKE :search OR l.name ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "jv.reference_id",
    name: "l.name",
    job_address: PROPERTY_ADDRESS_SQL,
    description: "jv.title",
    created_user: "creator.name",
  });
  applyJobScope(user, where, replacements);

  const whereClause = where.join(" AND ");
  const sortable = { variationId: "jv.reference_id", name: "l.name", status: "jv.status", amount: "jv.amount", createdDate: "jv.created_at" };
  const orderCol = sortable[sort_by] || "jv.created_at";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const dataQuery = `
        SELECT
          j.is_sample_data AS "isSampleData",
          jv.reference_id AS "variationId", l.name AS "name", ${PROPERTY_ADDRESS_SQL} AS "jobAddress",
          jv.title AS "description", jv.status AS "status",
          jv.variation_date AS "variationSent",
          COALESCE(jv.approved_at::text, CASE WHEN jv.signed_document IS NOT NULL THEN 'Signed' ELSE NULL END) AS "variationSigned",
          CASE WHEN jv.invoice_id IS NOT NULL THEN 'Yes' ELSE 'No' END AS "invoiceCreated",
          CASE WHEN jv.invoice_document IS NOT NULL THEN 'Yes' ELSE 'No' END AS "invoiceSent",
          jv.amount AS "amount", iv.deposite_amount AS "payment",
          CASE WHEN COALESCE(jv.delayed_days, 0) > 0 THEN 'Yes' ELSE 'No' END AS "extensionSent",
          jv.created_at AS "createdDate", creator.name AS "createdUser"
        ${JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total ${JOINS} WHERE ${whereClause}`;

  const [rows, countRows] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
  ]);
  const total = countRows[0]?.total || 0;

  return {
    columns: VARIATION_REPORT_COLUMNS,
    rows: rows.map((r) => keysToCamelCase(r)),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

export default { getVariationReport };
