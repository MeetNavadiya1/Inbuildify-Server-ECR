import jobVariationService from "./job-variation.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

export async function createJobVariation(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobVariationService.createJobVariation(job_id, req.body, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("createJobVariation error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getJobVariations(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobVariationService.getJobVariations(job_id, req.query, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getJobVariations error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getJobVariationById(req, res) {
  try {
    const { variation_id } = req.params;
    const result = await jobVariationService.getJobVariationById(variation_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getJobVariationById error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updateJobVariation(req, res) {
  try {
    const { variation_id } = req.params;
    const result = await jobVariationService.updateJobVariation(variation_id, req.body, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("updateJobVariation error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteJobVariation(req, res) {
  try {
    const { variation_id } = req.params;
    const result = await jobVariationService.deleteJobVariation(variation_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, null, result.message);
  } catch (error) {
    console.error("deleteJobVariation error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// POST — upload the signed variation document (tracker step 4). Multipart file.
export async function uploadSignedVariationDocument(req, res) {
  try {
    const { variation_id } = req.params;
    const result = await jobVariationService.uploadSignedDocument(variation_id, req.file, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("uploadSignedVariationDocument error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// GET — presigned download URL for the signed variation document.
export async function getSignedVariationDocument(req, res) {
  try {
    const { variation_id } = req.params;
    const result = await jobVariationService.getSignedDocument(variation_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getSignedVariationDocument error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// DELETE — remove the signed variation document and reopen tracker step 4.
export async function deleteSignedVariationDocument(req, res) {
  try {
    const { variation_id } = req.params;
    const result = await jobVariationService.deleteSignedDocument(variation_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("deleteSignedVariationDocument error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// POST — render a preview PDF of the variation items currently in the editor.
export async function previewJobVariation(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobVariationService.previewVariation(job_id, req.body, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("previewJobVariation error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// GET prefill data (recipient / subject / message) for the variation email.
// ?recipient=customer targets the customer; defaults to the builder.
export async function getVariationEmailData(req, res) {
  try {
    const { variation_id } = req.params;
    const recipient = req.query.recipient === "customer" ? "customer" : "builder";
    const result = await jobVariationService.getVariationEmailData(variation_id, req.user, recipient);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getVariationEmailData error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// POST — send the variation approval email to the builder.
export async function sendVariationEmail(req, res) {
  try {
    const { variation_id } = req.params;
    const result = await jobVariationService.sendVariationEmail(variation_id, req.body, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("sendVariationEmail error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// GET — prefill data for the invoice email (tracker step 6).
export async function getInvoiceEmailData(req, res) {
  try {
    const { variation_id } = req.params;
    const result = await jobVariationService.getInvoiceEmailData(variation_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getInvoiceEmailData error:", error?.message || error);
    console.error("getInvoiceEmailData stack:", error?.stack);
    return handleControllerError(res, error, error?.message || "Internal server error");
  }
}

// POST — generate + store the invoice PDF and email it to the customer.
export async function sendInvoiceEmail(req, res) {
  try {
    const { variation_id } = req.params;
    const result = await jobVariationService.sendInvoiceEmail(variation_id, req.body, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("sendInvoiceEmail error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}
