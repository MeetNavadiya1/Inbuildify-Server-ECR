import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createJobInvoiceService,
  getJobInvoicesService,
  getJobInvoiceByIdService,
  updateJobInvoiceService,
  deleteJobInvoiceService,
  getJobInvoiceSummaryService,
  sendJobInvoiceEmailService,
  getJobInvoiceWorkflowService,
  createJobInvoicePaymentService,
  getJobInvoicePaymentsService,
  updateJobInvoicePaymentService,
  deleteJobInvoicePaymentService,
  sendJobInvoiceReceiptService,
  saveContractDatesService,
  getContractDatesService,
} from "./job-invoice.service.js";

// ─── Invoice CRUD ─────────────────────────────────────────────────────────────

export async function createJobInvoice(req, res) {
  try {
    const result = await createJobInvoiceService(req.body, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("createJobInvoice:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getJobInvoices(req, res) {
  try {
    const result = await getJobInvoicesService(req.params.job_id, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("getJobInvoices:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getJobInvoiceById(req, res) {
  try {
    const result = await getJobInvoiceByIdService(req.params.job_invoice_id, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("getJobInvoiceById:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateJobInvoice(req, res) {
  try {
    const result = await updateJobInvoiceService(req.params.job_invoice_id, req.body, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("updateJobInvoice:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteJobInvoice(req, res) {
  try {
    const result = await deleteJobInvoiceService(req.params.job_invoice_id, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("deleteJobInvoice:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getJobInvoiceSummary(req, res) {
  try {
    const result = await getJobInvoiceSummaryService(req.params.job_id, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("getJobInvoiceSummary:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

// ─── Invoice Email ────────────────────────────────────────────────────────────

export async function sendJobInvoiceEmail(req, res) {
  try {
    const result = await sendJobInvoiceEmailService(
      req.params.job_invoice_id,
      req.body,
      req.user,
      req.file,
    );
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("sendJobInvoiceEmail:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

// ─── Invoice Workflow ─────────────────────────────────────────────────────────

export async function getJobInvoiceWorkflow(req, res) {
  try {
    const result = await getJobInvoiceWorkflowService(req.params.job_invoice_id, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("getJobInvoiceWorkflow:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function createJobInvoicePayment(req, res) {
  try {
    const result = await createJobInvoicePaymentService(req.params.job_invoice_id, req.body, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("createJobInvoicePayment:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getJobInvoicePayments(req, res) {
  try {
    const result = await getJobInvoicePaymentsService(req.params.job_invoice_id, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("getJobInvoicePayments:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateJobInvoicePayment(req, res) {
  try {
    const result = await updateJobInvoicePaymentService(
      req.params.job_invoice_id,
      req.params.payment_id,
      req.body,
      req.user
    );
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("updateJobInvoicePayment:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteJobInvoicePayment(req, res) {
  try {
    const result = await deleteJobInvoicePaymentService(
      req.params.job_invoice_id,
      req.params.payment_id,
      req.user
    );
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("deleteJobInvoicePayment:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export async function sendJobInvoiceReceipt(req, res) {
  try {
    const result = await sendJobInvoiceReceiptService(
      req.params.job_invoice_id,
      req.body,
      req.user,
      req.file,
    );
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("sendJobInvoiceReceipt:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

// ─── Contract Dates ───────────────────────────────────────────────────────────

export async function saveContractDates(req, res) {
  try {
    const result = await saveContractDatesService(req.params.job_id, req.body, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("saveContractDates:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getContractDates(req, res) {
  try {
    const result = await getContractDatesService(req.params.job_id, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("getContractDates:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}
