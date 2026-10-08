import { successResponse, errorResponse } from "../../helper/response.js";
import {
  createInvoiceService,
  getInvoicesByLeadService,
  getInvoiceByIdService,
  updateInvoiceService,
  deleteInvoiceService,
} from "./invoice.service.js";

/**
 * Creates a new invoice or capture a deposit for a lead.
 */
export async function createInvoice(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await createInvoiceService(req.body, builderId, companyId);

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error creating invoice:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}

/**
 * Retrieves all invoices/deposits associated with a specific lead.
 */
export async function getInvoicesByLead(req, res) {
  try {
    const { leads_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await getInvoicesByLeadService(leads_id, builderId, companyId);

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error fetching invoices by lead:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}

/**
 * Retrieves a single invoice/deposit record by ID.
 */
export async function getInvoiceById(req, res) {
  try {
    const { invoice_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await getInvoiceByIdService(invoice_id, builderId, companyId);

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error fetching invoice by ID:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}

/**
 * Updates an existing invoice/deposit record.
 */
export async function updateInvoice(req, res) {
  try {
    const { invoice_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await updateInvoiceService(invoice_id, req.body, builderId, companyId);

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error updating invoice:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}

/**
 * Deletes an invoice/deposit record.
 */
export async function deleteInvoice(req, res) {
  try {
    const { invoice_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await deleteInvoiceService(invoice_id, builderId, companyId);

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error deleting invoice:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}
