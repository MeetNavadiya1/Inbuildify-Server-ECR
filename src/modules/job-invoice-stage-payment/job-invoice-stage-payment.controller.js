
import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createStagePaymentService,
  getAllStagePaymentService,
  deleteStagePaymentService,
  updateStagePaymentService,
} from "./job-invoice-stagePayment.service.js";

// CREATE
export async function createJobInvoiceStagePayment(req, res) {
  try {
    const result = await createStagePaymentService(req.body, req.user);
    return successResponse(res, keysToCamelCase(result), "Created successfully");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// GET ALL
export async function getAllJobInvoiceStagePayments(req, res) {
  try {
    const result = await getAllStagePaymentService(req.query, req.user);

    return successResponse(
      res,
      {
        jobInvoiceStagePayments: keysToCamelCase(result.data),
        pagination: result.pagination,
      },
      "Fetched successfully",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// DELETE
export async function deleteJobInvoiceStagePayment(req, res) {
  try {
    await deleteStagePaymentService(req.params.id, req.user);
    return successResponse(res, null, "Deleted successfully");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// UPDATE
export async function updateJobInvoiceStagePayment(req, res) {
  try {
    const result = await updateStagePaymentService(
      req.params.job_invoice_stage_payment_id,
      req.body,
      req.user,
    );

    return successResponse(res, keysToCamelCase(result), "Updated successfully");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}
