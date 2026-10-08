import db from "../../config/database/models/postgre-models/index.js";
import sendEmail from "../../service/sendMail.service.js";
import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import {
  wrapJobInvoiceEmailHTML,
  buildJobInvoicePlainText,
} from "../../templates/job-invoice-email.template.js";
import { getQuotationVersionGrandTotal } from "../../helper/quotationTotal.helper.js";
import { getJobLedgerService } from "../job-ledger/job-ledger.service.js";

/**
 * Persist an emailed invoice / payment-receipt PDF (already uploaded to S3 as
 * `pdfFile`) into drive_files so it surfaces in the Job Documents tab. Keyed by
 * the job-invoice id + reference_type; the previous file(s) of that type for the
 * invoice are removed first so a re-send overwrites in place. Job-scoped only (no
 * lead_id) — see job.service.getJobDocuments. Best-effort and un-transactioned:
 * a failure here must never block sending the invoice/receipt to the customer.
 */
async function persistJobInvoiceDriveFile({ jobInvoiceId, referenceType, defaultName, pdfFile, user }) {
  if (!pdfFile?.key) return;
  try {
    const nameSource = pdfFile.originalname || pdfFile.key || "";
    const ext = nameSource.includes(".") ? nameSource.split(".").pop() : "pdf";

    const previous = await db.DriveFile.findAll({
      where: { reference_id: jobInvoiceId, reference_type: referenceType },
    });
    for (const prev of previous) await prev.destroy({ force: true });

    await db.DriveFile.create({
      company_id: user?.company_id || null,
      builder_id: user?.builder_id || null,
      uploaded_by: user?.users_id || null,
      reference_id: jobInvoiceId,
      reference_type: referenceType,
      original_name: pdfFile.originalname || defaultName,
      file_name: pdfFile.key.split("/").pop(),
      s3_key: pdfFile.key,
      file_extension: ext,
      mime_type: pdfFile.mimetype || "application/pdf",
      size: pdfFile.size ?? null,
    });
  } catch (err) {
    console.error("persistJobInvoiceDriveFile failed:", err.message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verify the job exists and belongs to the caller's tenant.
 */
async function assertJobAccess(jobId, builderId, companyId) {
  const { Job } = db;
  const job = await Job.findOne({
    where: {
      job_id: jobId,
      [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
    },
  });
  if (!job) throw { status: 404, message: "Job not found or access denied" };
  return job;
}

/**
 * Verify the invoice exists and is linked to a job the caller can access.
 */
async function assertInvoiceAccess(jobInvoiceId, builderId, companyId) {
  const { JobInvoice, Job } = db;
  const invoice = await JobInvoice.findByPk(jobInvoiceId, {
    include: [{ model: Job, as: "job", attributes: ["job_id", "builder_id", "company_id", "reference_number", "quotation_version_id"] }],
  });
  if (!invoice) throw { status: 404, message: "Invoice not found" };

  const j = invoice.job;
  if (!j || (j.builder_id !== builderId && j.company_id !== companyId)) {
    throw { status: 403, message: "Access denied" };
  }
  return invoice;
}

// ─── Invoice terms / overdue ──────────────────────────────────────────────────

/**
 * Tenant invoice settings (Settings → Job → Invoice). A tenant with no settings
 * row bills on receipt (0 terms days) and prints no PDF summary — the same
 * fallback job-variation.service uses for its variation invoices.
 */
async function resolveInvoiceSettings(builderId, companyId, transaction) {
  // Most- to least-specific. The exact (company, builder) pair is the row the
  // Settings screen reads and writes, so it has to win: a plain builder_id OR
  // company_id match can pull a sibling company's row for a multi-company
  // builder and quietly bill on the wrong terms.
  const scopes = [];
  if (builderId && companyId) scopes.push({ builder_id: builderId, company_id: companyId });
  if (builderId) scopes.push({ builder_id: builderId });
  if (companyId) scopes.push({ company_id: companyId });

  for (const where of scopes) {
    const record = await db.JobInvoiceSettings.findOne({
      where,
      attributes: ["invoice_terms_days", "show_invoice_summary_in_pdf"],
      transaction,
    }).catch(() => null);

    if (record) {
      return {
        invoiceTermsDays: Number(record.invoice_terms_days) || 0,
        showInvoiceSummaryInPdf: !!record.show_invoice_summary_in_pdf,
      };
    }
  }

  return { invoiceTermsDays: 0, showInvoiceSummaryInPdf: false };
}

/**
 * Normalise to the "YYYY-MM-DD" string the DATEONLY columns store. Callers hand
 * us three different shapes: a Date (Joi coerces `invoice_date`/`due_date` on
 * the way in), an already-plain DATEONLY string read back from Postgres, or a
 * full ISO timestamp. Date-only values are parsed by Joi as UTC midnight, so
 * reading the UTC calendar day back off the Date is what round-trips.
 */
function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** Today as a DATEONLY string, so date maths never crosses into time-of-day. */
function todayDateOnly() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** `date` + `days`, returned as a DATEONLY string. Null for an unparseable date. */
function addDays(date, days) {
  const start = toDateOnly(date);
  if (!start) return null;
  const base = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + (Number(days) || 0));
  return base.toISOString().slice(0, 10);
}

/**
 * Due date for a new invoice: whatever the caller sent, else invoice date +
 * the configured Invoice Terms. 0 terms means due on receipt (= invoice date).
 */
function resolveDueDate({ dueDate, invoiceDate, termsDays }) {
  if (dueDate) return toDateOnly(dueDate);
  if (!invoiceDate) return null;
  return addDays(invoiceDate, termsDays);
}

/**
 * "overdue" is derived from the due date, never set by hand: an issued invoice
 * (sent, or skip-sent/"unsent") whose due date has passed and which is not fully
 * paid. Drafts are not yet issued, and paid invoices are settled, so both keep
 * their status. Moving the due date back into the future reverses the flag.
 */
function deriveInvoiceStatus(invoice) {
  const status = invoice.status;
  if (status === "draft" || status === "paid") return status;

  const due = toDateOnly(invoice.due_date);
  if (due && due < todayDateOnly()) return "overdue";

  // No longer past due — fall back to whichever issued state it came from.
  if (status === "overdue") return invoice.email_sent_at ? "sent" : "unsent";
  return status;
}

/**
 * Persist the derived status onto the rows that changed. Written back (rather
 * than computed per response) so every raw-status reader — the Invoice & Payment
 * report, exports, portal — agrees with what the Invoices table shows.
 */
async function applyOverdueStatus(invoices, transaction) {
  const list = Array.isArray(invoices) ? invoices : [invoices];
  for (const invoice of list) {
    if (!invoice) continue;
    const derived = deriveInvoiceStatus(invoice);
    if (derived !== invoice.status) {
      await invoice.update({ status: derived }, { transaction });
    }
  }
  return invoices;
}

/**
 * Assemble the {invoice, job, company} shape the invoice PDF/email templates
 * expect. The customer lives on the lead (job → opportunity → lead), and the
 * remitter details on the company — mirrors the job/company payload the
 * frontend feeds into components/pdf/Invoice.tsx so the emailed invoice and the
 * attached PDF agree.
 */
async function buildInvoiceEmailContext(invoice, transaction) {
  const { Job, Opportunity, Leads, PropertyDetail, State, Company, Address } = db.sequelize.models;

  const jobRecord = await Job.findOne({
    where: { job_id: invoice.job_id },
    include: [
      {
        model: Opportunity,
        as: "opportunity",
        include: [
          {
            model: Leads,
            as: "lead",
            include: [
              { model: PropertyDetail, as: "propertyDetail", include: [{ model: State, as: "state" }] },
            ],
          },
        ],
      },
      { model: Company, as: "company", include: [{ model: Address, as: "address" }] },
    ],
    transaction,
  });

  const jobPlain = jobRecord ? jobRecord.get({ plain: true }) : {};
  const lead = jobPlain.opportunity?.lead || {};
  const property = lead.propertyDetail || {};
  const companyRow = jobPlain.company || {};
  const companyAddress = companyRow.address || {};

  const jobAddress = [
    property.lot_number,
    property.street,
    property.address_line1,
    property.address_line2,
    property.city,
    property.state?.name,
    property.zip_code,
  ]
    .map((s) => s?.trim?.() ?? s)
    .filter(Boolean)
    .join(", ");

  const { invoiceTermsDays } = await resolveInvoiceSettings(
    jobPlain.builder_id,
    jobPlain.company_id,
    transaction,
  );

  return {
    invoice: {
      referenceNumber: invoice.reference_number,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      termsDays: invoiceTermsDays,
      isOverdue: invoice.status === "overdue",
      description: invoice.description,
      invoiceAmount: invoice.invoice_amount,
    },
    job: {
      referenceNumber: jobPlain.reference_number,
      customerName: lead.name,
      jobAddress,
      customerPhone: lead.phone,
      customerEmail: lead.email,
    },
    company: {
      name: companyRow.name,
      abnNumber: companyRow.abn_number,
      address1: companyAddress.address_line1,
      address2: companyAddress.address_line2,
      city: companyAddress.city,
      zipPostalCode: companyAddress.zip_code,
      accountName: companyRow.account_name,
      accountNumber: companyRow.account_number,
      accountBsb: companyRow.account_bsb,
      bankName: companyRow.bank_name,
    },
  };
}

/**
 * Generate next reference number for a job's invoice: {jobRef}-I{n}
 */
async function generateInvoiceRef(jobId, jobRef, transaction) {
  const { JobInvoice } = db;
  const count = await JobInvoice.count({ where: { job_id: jobId }, transaction });
  return `${jobRef}-I${count + 1}`;
}

/**
 * Recalculate invoice status based on total payments vs invoice amount.
 */
async function recalculateInvoiceStatus(invoice, transaction) {
  const { JobInvoicePayment } = db;
  const payments = await JobInvoicePayment.findAll({
    where: { job_invoice_id: invoice.job_invoice_id },
    transaction,
  });

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const invoiceAmt = parseFloat(invoice.invoice_amount || 0);

  let newStatus = invoice.status;
  if (invoiceAmt > 0 && totalPaid >= invoiceAmt) {
    newStatus = "paid";
  } else if (invoice.status === "paid") {
    // payment was deleted, revert to sent if email was sent
    newStatus = invoice.email_sent_at ? "sent" : "draft";
  }

  if (newStatus !== invoice.status) {
    await invoice.update({ status: newStatus }, { transaction });
  }

  // Un-paying an invoice can expose a due date that has since passed.
  await applyOverdueStatus(invoice, transaction);

  return totalPaid;
}

// ─── Format Helpers ───────────────────────────────────────────────────────────

function formatInvoice(inv) {
  const plain = inv.get({ plain: true });
  const payments = (plain.payments || []).map((p) => keysToCamelCase(p));
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  return {
    ...keysToCamelCase(plain),
    payments,
    totalPaid,
    job: plain.job ? keysToCamelCase(plain.job) : undefined,
  };
}

// ─── Service: Create Invoice ──────────────────────────────────────────────────

export const createJobInvoiceService = async (data, user) => {
  const builderId = user.builder_id;
  const companyId = user.company_id;
  const userId = user.users_id;

  return db.sequelize.transaction(async (t) => {
    const job = await assertJobAccess(data.job_id, builderId, companyId);
    const ref = await generateInvoiceRef(data.job_id, job.reference_number, t);

    // Fall back to the configured Invoice Terms when the form leaves the due
    // date blank, so the setting drives the payment deadline (and the overdue
    // flag that follows from it) rather than the invoice having none.
    const { invoiceTermsDays } = await resolveInvoiceSettings(job.builder_id, job.company_id, t);
    const invoiceDate = toDateOnly(data.invoice_date);
    const dueDate = resolveDueDate({
      dueDate: data.due_date,
      invoiceDate,
      termsDays: invoiceTermsDays,
    });

    const invoice = await db.JobInvoice.create(
      {
        job_id: data.job_id,
        reference_number: ref,
        description: data.description,
        notes: data.notes || null,
        invoice_date: invoiceDate,
        due_date: dueDate,
        invoice_amount: data.invoice_amount || null,
        amount_type: data.amount_type || "contract_cost",
        status: "draft",
        workflow_status: "created",
        created_by: userId,
        updated_by: userId,
      },
      { transaction: t }
    );

    return {
      data: keysToCamelCase(invoice.get({ plain: true })),
      message: "Invoice created successfully",
    };
  });
};

// ─── Service: List Invoices for a Job ────────────────────────────────────────

export const getJobInvoicesService = async (jobId, user) => {
  await assertJobAccess(jobId, user.builder_id, user.company_id);

  const invoices = await db.JobInvoice.findAll({
    where: { job_id: jobId },
    include: [{ model: db.JobInvoicePayment, as: "payments" }],
    order: [["created_at", "DESC"]],
  });

  // Re-evaluate against today's date on every read: an invoice tips into
  // "overdue" with the passage of time, with no request to hang the change on.
  await applyOverdueStatus(invoices);

  return {
    data: invoices.map(formatInvoice),
    message: "Invoices fetched successfully",
  };
};

// ─── Service: Get Single Invoice ──────────────────────────────────────────────

export const getJobInvoiceByIdService = async (jobInvoiceId, user) => {
  const invoice = await assertInvoiceAccess(jobInvoiceId, user.builder_id, user.company_id);

  const full = await db.JobInvoice.findByPk(jobInvoiceId, {
    include: [{ model: db.JobInvoicePayment, as: "payments" }],
  });

  await applyOverdueStatus(full);

  return { data: formatInvoice(full), message: "Invoice fetched successfully" };
};

// ─── Service: Update Invoice ──────────────────────────────────────────────────

export const updateJobInvoiceService = async (jobInvoiceId, data, user) => {
  return db.sequelize.transaction(async (t) => {
    const invoice = await assertInvoiceAccess(jobInvoiceId, user.builder_id, user.company_id);

    // Editing the invoice date without touching the due date re-derives the due
    // date from the configured terms, so the two never drift apart.
    const patch = { ...data };
    // Joi hands these over as Dates parsed at UTC midnight; pin them to a
    // calendar day before they reach the DATEONLY columns.
    if (patch.invoice_date !== undefined) patch.invoice_date = toDateOnly(patch.invoice_date);
    if (patch.due_date !== undefined) patch.due_date = toDateOnly(patch.due_date);
    if (patch.invoice_date !== undefined && patch.due_date === undefined) {
      const { invoiceTermsDays } = await resolveInvoiceSettings(
        invoice.job?.builder_id ?? user.builder_id,
        invoice.job?.company_id ?? user.company_id,
        t,
      );
      patch.due_date = addDays(patch.invoice_date, invoiceTermsDays);
    }

    await invoice.update(
      { ...patch, updated_by: user.users_id },
      { transaction: t }
    );

    // A new due date (or a status change out of draft) can flip the invoice into
    // or out of overdue right away.
    await applyOverdueStatus(invoice, t);

    return {
      data: keysToCamelCase(invoice.get({ plain: true })),
      message: "Invoice updated successfully",
    };
  });
};

// ─── Service: Delete Invoice ──────────────────────────────────────────────────

export const deleteJobInvoiceService = async (jobInvoiceId, user) => {
  return db.sequelize.transaction(async (t) => {
    const invoice = await assertInvoiceAccess(jobInvoiceId, user.builder_id, user.company_id);

    if (invoice.status !== "draft") {
      throw { status: 400, message: "Only draft invoices can be deleted" };
    }

    await invoice.destroy({ transaction: t });

    return { data: null, message: "Invoice deleted successfully" };
  });
};

// ─── Service: Invoice Summary (Stats Cards) ───────────────────────────────────

export const getJobInvoiceSummaryService = async (jobId, user) => {
  const job = await assertJobAccess(jobId, user.builder_id, user.company_id);

  const { data: ledger } = await getJobLedgerService(jobId, user);
  const totalCost = ledger.summary.totalCharged;

  const invoices = await db.JobInvoice.findAll({
    where: { job_id: jobId },
    include: [{ model: db.JobInvoicePayment, as: "payments" }],
  });

  await applyOverdueStatus(invoices);

  const invoiceGenerated = invoices.reduce((sum, inv) => {
    return sum + parseFloat(inv.invoice_amount || 0);
  }, 0);

  const paymentReceived = ledger.summary.totalCredited;

  // Overdue money owed, so the tab can surface it without a second round trip.
  const overdue = invoices.filter((inv) => inv.status === "overdue");
  const overdueAmount = overdue.reduce((sum, inv) => {
    const paid = (inv.payments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    return sum + Math.max(parseFloat(inv.invoice_amount || 0) - paid, 0);
  }, 0);

  // The Invoice settings ride along with the summary the tab already fetches on
  // mount — the create form needs the terms to prefill the due date, and the PDF
  // needs the summary toggle. Saves the job screen a second (admin-scoped) call.
  const { invoiceTermsDays, showInvoiceSummaryInPdf } = await resolveInvoiceSettings(
    job.builder_id,
    job.company_id,
  );

  return {
    data: {
      totalCost,
      invoiceGenerated,
      paymentReceived,
      balanceToPay: ledger.summary.balance,
      overdueCount: overdue.length,
      overdueAmount,
      invoiceTermsDays,
      showInvoiceSummaryInPdf,
    },
    message: "Summary fetched successfully",
  };
};

// ─── Service: Send Invoice Email ──────────────────────────────────────────────
export const sendJobInvoiceEmailService = async (jobInvoiceId, emailData, user, pdfFile = null) => {
  return db.sequelize.transaction(async (t) => {
    const invoice = await assertInvoiceAccess(jobInvoiceId, user.builder_id, user.company_id);

    // Update invoice status and workflow
    await invoice.update(
      {
        status: "sent",
        workflow_status: "invoice_sent",
        email_sent_at: new Date(),
        updated_by: user.users_id,
      },
      { transaction: t }
    );

    // Re-sending an invoice that is already past its due date must not quietly
    // clear the overdue flag.
    await applyOverdueStatus(invoice, t);

    const attachmentKeys = [];
    if (emailData.attach_pdf !== false && pdfFile?.key) {
      attachmentKeys.push({
        key: pdfFile.key,
        filename: pdfFile.originalname || "Invoice.pdf",
        contentType: pdfFile.mimetype || "application/pdf",
      });
    }

    // Save the invoice PDF into the Job Documents tab (best-effort).
    await persistJobInvoiceDriveFile({
      jobInvoiceId,
      referenceType: "JobInvoiceDocument",
      defaultName: "Tax Invoice.pdf",
      pdfFile,
      user,
    });

    // Render the invoice itself as the email body, matching the attached TAX
    // INVOICE PDF. Any message the user typed in the send panel is kept and
    // shown above the invoice rather than replacing it.
    const emailContext = await buildInvoiceEmailContext(invoice, t);
    const html = wrapJobInvoiceEmailHTML({ ...emailContext, bodyHtml: emailData.content });
    const plainText = buildJobInvoicePlainText(emailContext);

    // Dispatch email using standard mail queue service
    const toRecipients = Array.isArray(emailData.to) ? emailData.to.join(",") : emailData.to;
    await sendEmail(
      toRecipients,
      emailData.subject,
      plainText, // text (fallback)
      html, // html
      [], // raw attachments
      null, // cc
      attachmentKeys,
    );

    return {
      data: {
        invoiceId: jobInvoiceId,
        sentTo: emailData.to,
        sentAt: invoice.email_sent_at,
        // Not always "sent": re-sending a past-due invoice keeps it overdue.
        status: invoice.status,
        workflowStatus: "invoice_sent",
        attachedPdf: attachmentKeys.length > 0,
      },
      message: "Invoice email sent successfully",
    };
  });
};

// ─── Service: Get Invoice Workflow Status ─────────────────────────────────────

export const getJobInvoiceWorkflowService = async (jobInvoiceId, user) => {
  const invoice = await assertInvoiceAccess(jobInvoiceId, user.builder_id, user.company_id);

  const full = await db.JobInvoice.findByPk(jobInvoiceId, {
    include: [{ model: db.JobInvoicePayment, as: "payments" }],
  });

  await applyOverdueStatus(full);

  const plain = full.get({ plain: true });
  const payments = (plain.payments || []).map((p) => keysToCamelCase(p));

  return {
    data: {
      jobInvoiceId,
      workflowStatus: plain.workflow_status,
      status: plain.status,
      invoiceDate: plain.invoice_date,
      dueDate: plain.due_date,
      emailSentAt: plain.email_sent_at,
      receiptSentAt: plain.receipt_sent_at,
      payments,
    },
    message: "Workflow status fetched successfully",
  };
};

// ─── Service: Record Payment ──────────────────────────────────────────────────

export const createJobInvoicePaymentService = async (jobInvoiceId, data, user) => {
  return db.sequelize.transaction(async (t) => {
    const invoice = await assertInvoiceAccess(jobInvoiceId, user.builder_id, user.company_id);

    // Check payment doesn't exceed outstanding balance
    const payments = await db.JobInvoicePayment.findAll({
      where: { job_invoice_id: jobInvoiceId },
      transaction: t,
    });
    const alreadyPaid = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    const outstanding = parseFloat(invoice.invoice_amount || 0) - alreadyPaid;

    if (invoice.invoice_amount && parseFloat(data.amount) > outstanding + 0.001) {
      throw {
        status: 400,
        message: `Payment amount ($${data.amount}) exceeds outstanding balance ($${outstanding.toFixed(2)})`,
      };
    }

    const payment = await db.JobInvoicePayment.create(
      {
        job_invoice_id: jobInvoiceId,
        payment_date: data.payment_date,
        payment_method: data.payment_method,
        transaction_no: data.transaction_no || null,
        amount: data.amount,
        notes: data.notes || null,
        receipt_sent: false,
        created_by: user.users_id,
      },
      { transaction: t }
    );

    // Recalculate invoice paid status
    const totalPaid = alreadyPaid + parseFloat(data.amount);
    const invoiceAmt = parseFloat(invoice.invoice_amount || 0);
    const isFullyPaid = invoiceAmt > 0 && totalPaid >= invoiceAmt;

    await invoice.update(
      {
        status: isFullyPaid ? "paid" : invoice.status,
        workflow_status: "payment_recorded",
        updated_by: user.users_id,
      },
      { transaction: t }
    );

    return {
      data: keysToCamelCase(payment.get({ plain: true })),
      message: "Payment recorded successfully",
    };
  });
};

// ─── Service: List Payments for Invoice ───────────────────────────────────────

export const getJobInvoicePaymentsService = async (jobInvoiceId, user) => {
  await assertInvoiceAccess(jobInvoiceId, user.builder_id, user.company_id);

  const payments = await db.JobInvoicePayment.findAll({
    where: { job_invoice_id: jobInvoiceId },
    order: [["created_at", "DESC"]],
  });

  return {
    data: payments.map((p) => keysToCamelCase(p.get({ plain: true }))),
    message: "Payments fetched successfully",
  };
};

// ─── Service: Update Payment ──────────────────────────────────────────────────

export const updateJobInvoicePaymentService = async (jobInvoiceId, paymentId, data, user) => {
  return db.sequelize.transaction(async (t) => {
    await assertInvoiceAccess(jobInvoiceId, user.builder_id, user.company_id);

    const payment = await db.JobInvoicePayment.findOne({
      where: { job_invoice_payment_id: paymentId, job_invoice_id: jobInvoiceId },
      transaction: t,
    });

    if (!payment) throw { status: 404, message: "Payment not found" };
    if (payment.receipt_sent) {
      throw { status: 400, message: "Cannot edit a payment for which a receipt has already been sent" };
    }

    await payment.update(data, { transaction: t });

    return {
      data: keysToCamelCase(payment.get({ plain: true })),
      message: "Payment updated successfully",
    };
  });
};

// ─── Service: Delete Payment ──────────────────────────────────────────────────

export const deleteJobInvoicePaymentService = async (jobInvoiceId, paymentId, user) => {
  return db.sequelize.transaction(async (t) => {
    const invoice = await assertInvoiceAccess(jobInvoiceId, user.builder_id, user.company_id);

    const payment = await db.JobInvoicePayment.findOne({
      where: { job_invoice_payment_id: paymentId, job_invoice_id: jobInvoiceId },
      transaction: t,
    });

    if (!payment) throw { status: 404, message: "Payment not found" };
    if (payment.receipt_sent) {
      throw { status: 400, message: "Cannot delete a payment for which a receipt has been sent" };
    }

    await payment.destroy({ transaction: t });

    // Recalculate invoice status after deletion
    await recalculateInvoiceStatus(invoice, t);

    return { data: null, message: "Payment deleted successfully" };
  });
};

// ─── Service: Send Receipt Email ──────────────────────────────────────────────

export const sendJobInvoiceReceiptService = async (jobInvoiceId, data, user, pdfFile = null) => {
  return db.sequelize.transaction(async (t) => {
    await assertInvoiceAccess(jobInvoiceId, user.builder_id, user.company_id);

    // Mark selected payments as receipt sent
    await db.JobInvoicePayment.update(
      { receipt_sent: true, receipt_sent_at: new Date() },
      {
        where: {
          job_invoice_payment_id: { [Op.in]: data.payment_ids },
          job_invoice_id: jobInvoiceId,
        },
        transaction: t,
      }
    );

    // Update invoice workflow
    const invoice = await db.JobInvoice.findByPk(jobInvoiceId, { transaction: t });
    await invoice.update(
      {
        workflow_status: "receipt_sent",
        receipt_sent_at: new Date(),
        updated_by: user.users_id,
      },
      { transaction: t }
    );

    const attachmentKeys = [];
    if (data.attach_pdf !== false && pdfFile?.key) {
      attachmentKeys.push({
        key: pdfFile.key,
        filename: pdfFile.originalname || "Receipt.pdf",
        contentType: pdfFile.mimetype || "application/pdf",
      });
    }

    // Save the payment-receipt PDF into the Job Documents tab (best-effort).
    await persistJobInvoiceDriveFile({
      jobInvoiceId,
      referenceType: "JobInvoiceReceiptDocument",
      defaultName: "Payment Receipt.pdf",
      pdfFile,
      user,
    });

    // Dispatch email using standard mail queue service
    const toRecipients = Array.isArray(data.to) ? data.to.join(",") : data.to;
    await sendEmail(
      toRecipients,
      data.subject,
      null, // text
      data.content, // html
      [], // raw attachments
      null, // cc
      attachmentKeys, // attachment s3 keys
    );

    return {
      data: {
        invoiceId: jobInvoiceId,
        sentTo: data.to,
        paymentIds: data.payment_ids,
        sentAt: invoice.receipt_sent_at,
        workflowStatus: "receipt_sent",
        attachedPdf: attachmentKeys.length > 0,
      },
      message: "Receipt sent successfully",
    };
  });
};

// ─── Service: Save Contract Dates ─────────────────────────────────────────────

export const saveContractDatesService = async (jobId, data, user) => {
  return db.sequelize.transaction(async (t) => {
    const job = await assertJobAccess(jobId, user.builder_id, user.company_id);

    const wasSignedBefore = !!job.contract_signed_date;
    const isNowSigned = !!data.contract_signed_date;

    await job.update(
      {
        contract_prepared_date: data.contract_prepared_date ?? job.contract_prepared_date,
        contract_signed_date: data.contract_signed_date ?? job.contract_signed_date,
      },
      { transaction: t }
    );

    // Auto-generate stage-payment invoices if contract is newly signed
    if (!wasSignedBefore && isNowSigned) {
      await autoGenerateStageInvoices(job, user, t);
    }

    return {
      data: {
        jobId,
        contractPreparedDate: job.contract_prepared_date,
        contractSignedDate: job.contract_signed_date,
      },
      message: "Contract dates saved successfully",
    };
  });
};

// ─── Service: Get Contract Dates ──────────────────────────────────────────────

export const getContractDatesService = async (jobId, user) => {
  const job = await assertJobAccess(jobId, user.builder_id, user.company_id);
  return {
    data: {
      jobId,
      contractPreparedDate: job.contract_prepared_date || null,
      contractSignedDate: job.contract_signed_date || null,
    },
    message: "Contract dates fetched successfully",
  };
};

// ─── Private: Auto-generate stage invoices on contract signing ───────────────

async function autoGenerateStageInvoices(job, user, transaction) {
  const { JobInvoiceSettings, JobInvoiceStagePayments, JobInvoice, QuotationVersion } = db;

  // Find company-level invoice settings
  const settings = await JobInvoiceSettings.findOne({
    where: {
      [Op.or]: [{ builder_id: job.builder_id }, { company_id: job.company_id }],
    },
    transaction,
  });

  if (!settings) return; // No settings configured — skip

  // Get stage payment templates
  const stages = await JobInvoiceStagePayments.findAll({
    where: { job_invoice_settings_id: settings.job_invoice_settings_id },
    order: [["sort_order", "ASC"]],
    transaction,
  });

  if (!stages || stages.length === 0) return;

  // Total contract cost — the quoted grand total. Stage amounts are a
  // percentage of this, so a bare item sum (which omits the structure engineer
  // and facade charges) would under-bill every stage invoice.
  const totalCost = await getQuotationVersionGrandTotal(job.quotation_version_id, { transaction });

  // Count existing invoices for reference numbering
  let existingCount = await JobInvoice.count({
    where: { job_id: job.job_id },
    transaction,
  });

  // Stage invoices are dated from the contract signing that triggered them, and
  // fall due after the configured Invoice Terms.
  const termsDays = Number(settings.invoice_terms_days) || 0;
  const invoiceDate = toDateOnly(job.contract_signed_date) || todayDateOnly();
  const dueDate = addDays(invoiceDate, termsDays);

  // Create one draft invoice per stage
  for (const stage of stages) {
    existingCount += 1;
    const refNumber = `${job.reference_number}-I${existingCount}`;
    const amount = totalCost > 0 && stage.percentage
      ? (totalCost * parseFloat(stage.percentage)) / 100
      : null;

    await JobInvoice.create(
      {
        job_id: job.job_id,
        reference_number: refNumber,
        description: stage.description,
        notes: null,
        invoice_date: invoiceDate,
        due_date: dueDate,
        invoice_amount: amount,
        amount_type: "contract_cost",
        status: "draft",
        workflow_status: "created",
        created_by: user.users_id,
        updated_by: user.users_id,
      },
      { transaction }
    );
  }
}
