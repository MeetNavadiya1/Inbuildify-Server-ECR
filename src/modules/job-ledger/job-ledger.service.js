import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { getQuotationVersionGrandTotal } from "../../helper/quotationTotal.helper.js";
import { getColorItemsByIdsService } from "../color-item/color-item.service.js";
import { resolvePermission } from "../../helper/permissionResolver.helper.js";
import { applyRowScope } from "../../helper/rbac.helper.js";
import { MODULES, ACTIONS } from "../../constants/rbac.js";

// Same columns job.service.js scopes on — a Site Supervisor sees only jobs they
// supervise, a Contact only their own. Reading the ledger must not be a way
// around the scoping GET /job/:id already applies.
const JOB_SCOPE_COLUMNS = {
  supervisorColumn: "supervisor_id",
  contactIdColumn: "customer_contact_id",
};

/**
 * Job ledger — the one place the money on a job is added up.
 *
 * The header, the modal behind "Balance to be paid" and the Invoices tab used to
 * each do their own arithmetic in their own layer; this service replaces all of
 * that with one server-side computation and returns finished totals.
 *
 * Rows come from two places and are tagged with `source` so the UI knows which
 * are editable:
 *  - DERIVED (read-only): the quotation grand total, the colour selections, each
 *    approved variation, and every recorded invoice payment.
 *  - MANUAL (`source: "manual"`): rows in `job_ledger_entry` — extra charges,
 *    discounts, off-invoice receipts, and the builder's own outside/personal
 *    expenses.
 *
 * Invoice payments are deliberately never copied into `job_ledger_entry`: one
 * payment, one row, no drift and no double-count.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = (value) => Number(Number(value || 0).toFixed(2));

/**
 * Verify the job exists, belongs to the caller's tenant, and — for the
 * row-scoped roles — is one of theirs.
 *
 * The tenant half mirrors job-invoice.service.assertJobAccess. The row-scope
 * half does not exist there and did not need to: every INVOICE-holding role is
 * company- or builder-scoped, so applyRowScope is a no-op for all of them. The
 * ledger READ is guarded as MODULES.JOB, which admits Site Supervisor
 * (SITE_ASSIGNED) and Contact (JOB_ONLY) — without this they could read the
 * account of any job in the builder.
 */
async function assertJobAccess(jobId, builderId, companyId, user) {
  const { Job } = db;
  const rowScope = user ? applyRowScope({}, user, MODULES.JOB, JOB_SCOPE_COLUMNS) : {};
  const job = await Job.findOne({
    where: {
      job_id: jobId,
      ...rowScope,
      [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
    },
    include: [{ model: db.Opportunity, as: "opportunity", attributes: ["leads_id"] }],
  });

  if (!job) {
    const err = new Error("Job not found or unauthorized");
    err.statusCode = 404;
    throw err;
  }
  return job;
}

async function assertEntryAccess(entryId, builderId, companyId) {
  const entry = await db.JobLedgerEntry.findOne({
    where: {
      job_ledger_entry_id: entryId,
      [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
    },
  });

  if (!entry) {
    const err = new Error("Ledger entry not found or unauthorized");
    err.statusCode = 404;
    throw err;
  }
  return entry;
}

/** DTO — `job_ledger_entry_id` is the PK, the frontend keys rows on `id`. */
const toEntryDto = (row, extra = {}) => ({
  id: row.job_ledger_entry_id,
  source: "manual",
  editable: true,
  ledger: row.ledger,
  entryType: row.entry_type,
  category: row.category || null,
  description: row.description,
  amount: money(row.amount),
  entryDate: row.entry_date,
  paymentMethod: row.payment_method || null,
  referenceNumber: row.reference_number || null,
  isPersonal: row.is_personal === true,
  notes: row.notes || null,
  isSampleData: row.is_sample_data === true,
  createdAt: row.createdAt || row.created_at,
  ...extra,
});

/** A derived row — same shape, but nothing about it can be edited here. */
const derived = ({ id, source, entryType, category, description, amount, entryDate, ...rest }) => ({
  id,
  source,
  editable: false,
  ledger: "customer",
  entryType,
  category,
  description,
  amount: money(amount),
  entryDate: entryDate || null,
  paymentMethod: null,
  referenceNumber: null,
  isPersonal: false,
  notes: null,
  ...rest,
});

/**
 * Money received against this job.
 *
 * `job_invoice_payment` is the current path. `invoice.deposite_amount` is the
 * older lead-scoped one, still the only record for jobs quoted before the job
 * invoice module existed. They are alternatives, NOT addends — a job that has
 * job-invoice payments ignores the legacy deposits, which is exactly the
 * precedence the job header used to apply client-side.
 */
async function collectPayments(job) {
  const invoices = await db.JobInvoice.findAll({
    where: { job_id: job.job_id },
    attributes: ["job_invoice_id", "reference_number", "description"],
    include: [
      {
        model: db.JobInvoicePayment,
        as: "payments",
        attributes: ["job_invoice_payment_id", "amount", "payment_date", "payment_method", "transaction_no"],
      },
    ],
  });

  const rows = [];
  for (const invoice of invoices) {
    for (const payment of invoice.payments || []) {
      rows.push(
        derived({
          id: payment.job_invoice_payment_id,
          source: "invoice_payment",
          entryType: "credit",
          category: "payment",
          description: `Payment — ${invoice.reference_number || invoice.description || "Invoice"}`,
          amount: payment.amount,
          entryDate: payment.payment_date,
          paymentMethod: payment.payment_method || null,
          referenceNumber: payment.transaction_no || invoice.reference_number || null,
        })
      );
    }
  }

  if (rows.length > 0) return rows;

  const leadsId = job.opportunity?.leads_id;
  if (!leadsId) return rows;

  const legacy = await db.Invoice.findAll({
    where: { leads_id: leadsId, deposite_amount: { [Op.ne]: null } },
    attributes: [
      "invoice_id",
      "reference_number",
      "deposite_amount",
      "deposite_date",
      "payment_method",
      "transaction_no",
      "createdAt",
    ],
    raw: true,
  });

  for (const invoice of legacy) {
    if (!Number(invoice.deposite_amount)) continue;
    rows.push(
      derived({
        id: invoice.invoice_id,
        source: "invoice_payment",
        entryType: "credit",
        category: "payment",
        description: `Deposit — ${invoice.reference_number || "Invoice"}`,
        amount: invoice.deposite_amount,
        entryDate: invoice.deposite_date || invoice.createdAt,
        paymentMethod: invoice.payment_method || null,
        referenceNumber: invoice.transaction_no || invoice.reference_number || null,
      })
    );
  }

  return rows;
}

/** The contract side of the customer book: quotation + colours + variations. */
async function collectContractCharges(job, user) {
  const [quotationTotal, colorSelections, variations] = await Promise.all([
    getQuotationVersionGrandTotal(job.quotation_version_id),
    db.JobColorSelection.findAll({
      where: { job_id: job.job_id },
      attributes: ["color_item_id"],
      raw: true,
    }),
    db.JobVariation.findAll({
      where: { job_id: job.job_id },
      attributes: ["variation_id", "reference_id", "title", "amount", "status", "variation_date"],
      raw: true,
    }),
  ]);

  let colorsCost = 0;
  const selectedItemIds = (colorSelections || []).map((s) => s.color_item_id).filter(Boolean);
  if (selectedItemIds.length > 0) {
    try {
      const selectedItems = await getColorItemsByIdsService({
        ids: selectedItemIds,
        companyId: job.company_id || user.company_id,
        builderId: job.builder_id || user.builder_id,
      });
      colorsCost = selectedItems.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    } catch (err) {
      console.error("JobLedger: colours cost failed for job", job.job_id, err.message);
    }
  }

  const approved = (variations || []).filter((v) => v.status === "approved");
  const variationsCost = approved.reduce((sum, v) => sum + Number(v.amount || 0), 0);

  const rows = [];

  if (Number(quotationTotal) !== 0) {
    rows.push(
      derived({
        id: `quotation-${job.quotation_version_id || job.job_id}`,
        source: "quotation",
        entryType: "debit",
        category: "contract",
        description: "Quotation — contract total",
        amount: quotationTotal,
        entryDate: job.contract_signed_date || job.createdAt || job.created_at,
      })
    );
  }

  if (colorsCost !== 0) {
    rows.push(
      derived({
        id: `colors-${job.job_id}`,
        source: "colors",
        entryType: "debit",
        category: "colours",
        description: "Colour selections",
        amount: colorsCost,
        entryDate: job.color_approved_at || job.createdAt || job.created_at,
      })
    );
  }

  for (const variation of approved) {
    if (!Number(variation.amount)) continue;
    rows.push(
      derived({
        id: variation.variation_id,
        source: "variation",
        entryType: Number(variation.amount) < 0 ? "credit" : "debit",
        category: "variation",
        description: `Variation — ${variation.title || variation.reference_id || "Approved variation"}`,
        amount: Math.abs(Number(variation.amount)),
        entryDate: variation.variation_date || job.createdAt || job.created_at,
      })
    );
  }

  return {
    rows,
    quotationTotal: money(quotationTotal),
    colorsCost: money(colorsCost),
    variationsCost: money(variationsCost),
    variationsCount: approved.length,
  };
}

/**
 * Date order, except the quotation always opens the book.
 *
 * The contract total is the account's opening balance, but its date is whatever
 * the job was signed/created on — which can fall after a backdated charge and
 * push the opening line into the middle of the running balance.
 */
const openingWeight = (row) => (row.source === "quotation" ? 0 : 1);

const sortByDate = (a, b) => {
  const weight = openingWeight(a) - openingWeight(b);
  if (weight !== 0) return weight;

  const left = a.entryDate ? new Date(a.entryDate).getTime() : 0;
  const right = b.entryDate ? new Date(b.entryDate).getTime() : 0;
  if (left === right) return 0;
  return left - right;
};

// ─── Service: Read the whole ledger ───────────────────────────────────────────

export const getJobLedgerService = async (jobId, user) => {
  const job = await assertJobAccess(jobId, user.builder_id, user.company_id, user);

  // The read is open to anyone who can open the job (see job-ledger.routes.js),
  // but the builder's own spend is not everybody's business: without INVOICE
  // READ the caller gets the customer book and nothing else.
  //
  // The write flags are resolved per action, not folded into the read one:
  // Admin Executive and Contract Admin hold INVOICE read-only, and Accounts has
  // create+update but no delete. One combined flag would have shown all three an
  // Add/Edit/Delete control that 403s on submit.
  const [canSeeMoney, canCreate, canUpdate, canDelete] = await Promise.all([
    resolvePermission(user, MODULES.INVOICE, ACTIONS.READ),
    resolvePermission(user, MODULES.INVOICE, ACTIONS.CREATE),
    resolvePermission(user, MODULES.INVOICE, ACTIONS.UPDATE),
    resolvePermission(user, MODULES.INVOICE, ACTIONS.DELETE),
  ]);

  const [contract, paymentRows, manualRows] = await Promise.all([
    collectContractCharges(job, user),
    collectPayments(job),
    db.JobLedgerEntry.findAll({
      where: { job_id: jobId },
      order: [["entry_date", "ASC"], ["created_at", "ASC"]],
    }),
  ]);

  const manual = manualRows.map((row) => toEntryDto(row));
  const manualCustomer = manual.filter((e) => e.ledger === "customer");
  const expenses = manual.filter((e) => e.ledger === "expense");

  // ── Customer book — this is what "Balance to be paid" means ────────────────
  const customerEntries = [...contract.rows, ...paymentRows, ...manualCustomer].sort(sortByDate);

  let running = 0;
  for (const entry of customerEntries) {
    running += entry.entryType === "debit" ? entry.amount : -entry.amount;
    entry.runningBalance = money(running);
  }

  const sumOf = (rows, type) =>
    money(rows.filter((r) => r.entryType === type).reduce((sum, r) => sum + r.amount, 0));

  const manualCharges = sumOf(manualCustomer, "debit");
  const manualCredits = sumOf(manualCustomer, "credit");
  const contractCharges = money(
    contract.rows.reduce((sum, r) => sum + (r.entryType === "debit" ? r.amount : -r.amount), 0)
  );
  const paymentsReceived = sumOf(paymentRows, "credit");

  const totalCharged = money(contractCharges + manualCharges);
  const totalCredited = money(paymentsReceived + manualCredits);
  const balance = money(totalCharged - totalCredited);

  // ── Expense book — builder's own money, never touches the balance ──────────
  const expenseOut = sumOf(expenses, "debit");
  const expenseBack = sumOf(expenses, "credit");
  const netExpenses = money(expenseOut - expenseBack);
  const personalExpenses = money(
    expenses
      .filter((e) => e.isPersonal && e.entryType === "debit")
      .reduce((sum, e) => sum + e.amount, 0)
  );

  return {
    data: {
      jobId,
      canViewExpenses: canSeeMoney,
      canAddEntries: canCreate,
      canEditEntries: canUpdate,
      canDeleteEntries: canDelete,
      entries: customerEntries,
      expenses: canSeeMoney ? [...expenses].sort(sortByDate) : [],
      summary: {
        // Charges
        quotationTotal: contract.quotationTotal,
        colorsCost: contract.colorsCost,
        variationsCost: contract.variationsCost,
        variationsCount: contract.variationsCount,
        contractCharges,
        manualCharges,
        totalCharged,
        // Credits
        paymentsReceived,
        manualCredits,
        totalCredited,
        // Balance — positive = customer owes, negative = customer in credit
        balance,
        isCustomerInCredit: balance < 0,
        // Expenses / P&L. Billed basis: what the job is worth on paper minus the
        // expenses recorded against it. Cash basis uses money actually received.
        // Null — not 0 — when redacted, so the UI can hide the tiles instead of
        // printing a zero that reads as "no expenses".
        expensesOut: canSeeMoney ? expenseOut : null,
        expensesRefunded: canSeeMoney ? expenseBack : null,
        netExpenses: canSeeMoney ? netExpenses : null,
        personalExpenses: canSeeMoney ? personalExpenses : null,
        profitLoss: canSeeMoney ? money(totalCharged - netExpenses) : null,
        cashProfitLoss: canSeeMoney ? money(totalCredited - netExpenses) : null,
      },
    },
    message: "Job ledger fetched successfully",
  };
};

// ─── Service: Manual entry CRUD ───────────────────────────────────────────────

export const createJobLedgerEntryService = async (payload, user) => {
  const job = await assertJobAccess(payload.job_id, user.builder_id, user.company_id, user);

  const entry = await db.JobLedgerEntry.create({
    job_id: job.job_id,
    company_id: job.company_id || user.company_id || null,
    builder_id: job.builder_id || user.builder_id || null,
    ledger: payload.ledger || "customer",
    entry_type: payload.entry_type,
    category: payload.category || null,
    description: payload.description,
    amount: payload.amount,
    entry_date: payload.entry_date,
    payment_method: payload.payment_method || null,
    reference_number: payload.reference_number || null,
    // Personal is an expense-book idea only — a charge to the customer can never
    // be the builder's personal spend.
    is_personal: (payload.ledger || "customer") === "expense" ? payload.is_personal === true : false,
    notes: payload.notes || null,
    created_by: user.users_id || null,
    updated_by: user.users_id || null,
  });

  return { data: toEntryDto(entry), message: "Entry added successfully" };
};

export const updateJobLedgerEntryService = async (entryId, payload, user) => {
  const entry = await assertEntryAccess(entryId, user.builder_id, user.company_id);

  const ledger = payload.ledger || entry.ledger;
  const patch = { updated_by: user.users_id || null };

  for (const field of [
    "ledger",
    "entry_type",
    "category",
    "description",
    "amount",
    "entry_date",
    "payment_method",
    "reference_number",
    "notes",
  ]) {
    if (payload[field] !== undefined) patch[field] = payload[field];
  }

  if (payload.is_personal !== undefined || payload.ledger !== undefined) {
    patch.is_personal = ledger === "expense" ? payload.is_personal === true : false;
  }

  await entry.update(patch);

  return { data: toEntryDto(entry), message: "Entry updated successfully" };
};

export const deleteJobLedgerEntryService = async (entryId, user) => {
  const entry = await assertEntryAccess(entryId, user.builder_id, user.company_id);
  await entry.destroy();
  return { data: { id: entryId }, message: "Entry deleted successfully" };
};

export default {
  getJobLedgerService,
  createJobLedgerEntryService,
  updateJobLedgerEntryService,
  deleteJobLedgerEntryService,
};
