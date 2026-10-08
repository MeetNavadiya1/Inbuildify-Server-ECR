import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { applyColumnSearchFilters, applySampleDataScope } from "../report-filter.util.js";
import { grandTotalSql } from "../../../utils/quotationTotals.sql.js";

/**
 * Job → financial reports.
 *   - Invoices & Payments: one row per job invoice (job_invoice); its payments
 *     (job_invoice_payment) are aggregated — total paid + latest receipt/date/mode.
 *   - Cost Summary: one row per job — contract value + invoice/receipt totals.
 *
 * Commission Report is NOT here: job_commission / job_commission_sub_stage have
 * no job_id (they're commission config templates, not per-job paid/to-be-paid
 * records), so the report's per-job breakdown has no data source yet.
 *
 * Best-effort NULLs (no clean source): Cost Summary → Variations (no variation
 * entity).
 */

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

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

// ─── Invoices & Payments ────────────────────────────────────────────────────
export const INVOICE_PAYMENT_COLUMNS = [
  { key: "invoiceId", label: "Invoice ID", sortable: true },
  { key: "name", label: "Name", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "invoiceDescription", label: "Invoice Description" },
  { key: "invoiceStatus", label: "Invoice Status" },
  { key: "invoiceAmount", label: "Invoice Amount", sortable: true },
  { key: "createdUser", label: "Created User" },
  { key: "invoiceDate", label: "Invoice Date", sortable: true },
  { key: "dueDate", label: "Due Date", sortable: true },
  { key: "receiptId", label: "Receipt ID" },
  { key: "paidAmount", label: "Paid Amount" },
  { key: "paymentDate", label: "Payment Date", sortable: true },
  { key: "modeOfPayment", label: "Mode of Payment" },
  { key: "assignee", label: "Assignee" },
  { key: "paymentRemark", label: "PaymentRemark" },
];

// Job invoices live in job_invoice (job-scoped). Tenant + row scope go via the
// job (builder_id/company_id are mirrored onto it). Customer name/address come
// from the job → opportunity → leads chain; per-invoice payment/receipt data
// lives in the job_invoice_payment child table (one invoice can have many
// payments) — aggregated here to keep the report at one row per invoice.
const INVOICE_JOINS = `
        FROM job_invoice ji
        JOIN job j ON ji.job_id = j.job_id
        LEFT JOIN opportunity o ON j.opportunity_id = o.opportunity_id
        LEFT JOIN leads l ON o.leads_id = l.leads_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        LEFT JOIN users creator ON ji.created_by = creator.users_id
        LEFT JOIN LATERAL (
          SELECT SUM(p.amount) AS paid_amount FROM job_invoice_payment p WHERE p.job_invoice_id = ji.job_invoice_id
        ) pay_sum ON TRUE
        LEFT JOIN LATERAL (
          SELECT p.transaction_no, p.payment_date, p.payment_method, p.notes
          FROM job_invoice_payment p
          WHERE p.job_invoice_id = ji.job_invoice_id
          ORDER BY p.payment_date DESC, p.created_at DESC
          LIMIT 1
        ) pay_last ON TRUE`;

function applyLeadScope(user, where, replacements) {
  if (user?.role_name === ROLES.SALES_EXECUTIVE) {
    where.push("l.assignee_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.AGENT) {
    where.push("l.created_by = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  }
}

export async function getInvoicePaymentReport({ builderId, companyId, user = null, filters = {} }) {
  const { pageNum, limitNum, offset } = paginate(filters);
  const { search, status, sort_by = "invoiceDate", sort_order = "desc" } = filters;

  const where = ["(j.builder_id = :builderId OR (j.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");

  if (status) {
    where.push("ji.status = :status"); replacements.status = status;
  }
  if (search) {
    where.push(`(ji.reference_number ILIKE :search OR l.name ILIKE :search OR ji.description ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "ji.reference_number",
    name: "l.name",
    job_address: PROPERTY_ADDRESS_SQL,
    invoice_description: "ji.description",
  });
  // Row-scoping: sales-exec/agent narrow via the lead; supervisor/contact via the job.
  applyLeadScope(user, where, replacements);
  applyJobScope(user, where, replacements);

  const whereClause = where.join(" AND ");
  const sortable = { invoiceId: "ji.reference_number", name: "l.name", invoiceAmount: "ji.invoice_amount", invoiceDate: "ji.invoice_date", dueDate: "ji.due_date", paymentDate: "pay_last.payment_date" };
  const orderCol = sortable[sort_by] || "ji.invoice_date";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const dataQuery = `
        SELECT
          j.is_sample_data AS "isSampleData",
          ji.reference_number AS "invoiceId", l.name AS "name", ${PROPERTY_ADDRESS_SQL} AS "jobAddress",
          ji.description AS "invoiceDescription", ji.status AS "invoiceStatus", ji.invoice_amount AS "invoiceAmount",
          creator.name AS "createdUser", ji.invoice_date AS "invoiceDate", ji.due_date AS "dueDate",
          pay_last.transaction_no AS "receiptId", pay_sum.paid_amount AS "paidAmount", pay_last.payment_date AS "paymentDate",
          pay_last.payment_method AS "modeOfPayment", assignee.name AS "assignee", pay_last.notes AS "paymentRemark"
        ${INVOICE_JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total ${INVOICE_JOINS} WHERE ${whereClause}`;

  const { rows, total } = await runReport(dataQuery, countQuery, replacements);
  return { columns: INVOICE_PAYMENT_COLUMNS, rows, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } };
}

// ─── Cost Summary ───────────────────────────────────────────────────────────
export const COST_SUMMARY_COLUMNS = [
  { key: "referenceId", label: "Reference ID", sortable: true },
  { key: "customerName", label: "Customer Name", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "contractDate", label: "Contract Date" },
  { key: "contractValue", label: "Contract Value" },
  { key: "variations", label: "Variations" },
  { key: "totalAmount", label: "Total Amount" },
  { key: "invoices", label: "Invoices" },
  { key: "receipts", label: "Receipts" },
  { key: "balanceDue", label: "Balance Due" },
  { key: "agentName", label: "Agent Name" },
];

const JOB_LEAD_JOINS = `
        FROM job j
        LEFT JOIN opportunity o ON j.opportunity_id = o.opportunity_id
        LEFT JOIN leads l ON o.leads_id = l.leads_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN quotation_version qv ON j.quotation_version_id = qv.quotation_version_id
        LEFT JOIN users creator ON l.created_by = creator.users_id`;

function applyJobScope(user, where, replacements) {
  if (user?.role_name === ROLES.SITE_SUPERVISOR) {
    where.push("j.supervisor_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.CONTACT) {
    where.push("j.customer_contact_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  }
}

export async function getCostSummaryReport({ builderId, companyId, user = null, filters = {} }) {
  const { pageNum, limitNum, offset } = paginate(filters);
  const { search, sort_by = "referenceId", sort_order = "desc" } = filters;

  const where = ["(j.builder_id = :builderId OR (j.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");
  if (search) {
    where.push(`(j.reference_number ILIKE :search OR l.name ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "j.reference_number",
    customer_name: "l.name",
    job_address: PROPERTY_ADDRESS_SQL,
    agent_name: "creator.name",
  });
  applyJobScope(user, where, replacements);
  const whereClause = where.join(" AND ");

  // Items are read through the job's version FK; the engineer/facade charges
  // through the joined version row. See utils/quotationTotals.sql.js.
  const contractValueSql = grandTotalSql("j.quotation_version_id", "qv");
  const invoicesSql = "COALESCE((SELECT SUM(iv.invoice_amount) FROM invoice iv WHERE iv.leads_id = l.leads_id), 0)";
  const receiptsSql = "COALESCE((SELECT SUM(iv.deposite_amount) FROM invoice iv WHERE iv.leads_id = l.leads_id), 0)";
  const contractDateSql = "(SELECT COALESCE(bc.contract_signed_date, bc.created_at::date) FROM building_contracts bc WHERE bc.job_id = j.job_id ORDER BY bc.created_at DESC LIMIT 1)";

  const sortable = { referenceId: "j.reference_number", customerName: "l.name" };
  const orderCol = sortable[sort_by] || "j.reference_number";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const dataQuery = `
        SELECT
          j.is_sample_data AS "isSampleData",
          j.reference_number AS "referenceId", l.name AS "customerName", ${PROPERTY_ADDRESS_SQL} AS "jobAddress",
          ${contractDateSql} AS "contractDate",
          ${contractValueSql} AS "contractValue",
          NULL::numeric AS "variations",
          ${contractValueSql} AS "totalAmount",
          ${invoicesSql} AS "invoices",
          ${receiptsSql} AS "receipts",
          (${invoicesSql} - ${receiptsSql}) AS "balanceDue",
          creator.name AS "agentName"
        ${JOB_LEAD_JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total ${JOB_LEAD_JOINS} WHERE ${whereClause}`;

  const { rows, total } = await runReport(dataQuery, countQuery, replacements);
  return { columns: COST_SUMMARY_COLUMNS, rows, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } };
}

export default { getInvoicePaymentReport, getCostSummaryReport };
