import quotationFormatService from "./quotation-format.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

/**
 * Creates a new Quotation Format.
 */
function missingUserContext(builderId, companyId) {
  return !builderId && !companyId;
}
export async function createQuotationFormat(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;
    const watermark = req.files?.watermark?.[0]?.location || req.body.watermark;
    const defaultFacade =
      req.files?.defaultFacade?.[0]?.location || req.body.default_facade;
    const draftBackgroundImage =
      req.files?.draftBackgroundImage?.[0]?.location || req.body.draft_background_image;
    const body = req.body;
    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }
    const result = await quotationFormatService.createQuotationFormatService({
      builderId,
      companyId,
      userId,
      watermark,
      defaultFacade,
      draftBackgroundImage,
      body,
    });

    return successResponse(res, result, "Quotation Format created successfully.");
  } catch (error) {
    console.error("Error creating Quotation Format:", error);
    return handleControllerError(res, error,
      error.message || "Failed to create Quotation Format."
    );
  }
}

/**
 * Updates an existing Quotation Format.
 */
export async function updateQuotationFormat(req, res) {

  try {
    const { quotation_format_id } = req.params;
    const builderId = req.user?.builder_id;
    const userId = req.user?.user_id;
    const data = req.body;
    const watermark = req.files?.watermark?.[0]?.location || req.body.watermark;
    const defaultFacade =
      req.files?.defaultFacade?.[0]?.location || req.body.default_facade;
    const draftBackgroundImage =
      req.files?.draftBackgroundImage?.[0]?.location || req.body.draft_background_image;

    const result = await quotationFormatService.updateQuotationFormatService({
      quotationFormatId: quotation_format_id,
      builderId,
      userId,
      watermark,
      defaultFacade,
      draftBackgroundImage,
      data,
    });

    return successResponse(res, result, "Quotation Format updated successfully.");
  } catch (error) {
    console.error("Error updating Quotation Format:", error);
    return handleControllerError(res, error,
      error.message || "Failed to update Quotation Format."
    );
  }
}

/**
 * Fetches a single Quotation Format by ID.
 */
export async function getQuotationFormatById(req, res) {
  try {
    const { quotation_format_id } = req.params;
    const builderId = req.user?.builder_id;

    const result = await quotationFormatService.getQuotationFormatByIdService({
      quotationFormatId: quotation_format_id,
      builderId,
    });

    return successResponse(res, result, "Quotation Format fetched successfully.");
  } catch (error) {
    console.error("Error fetching Quotation Format:", error);
    return handleControllerError(res, error,
      error.message || "Failed to fetch Quotation Format."
    );
  }
}

/**
 * Fetches all Quotation Formats.
 */
export async function getAllQuotationFormats(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const query = req.query;

    const result = await quotationFormatService.getAllQuotationFormatsService({
      builderId,
      companyId,
      query,
    });

    return successResponse(res, result, "Quotation Formats fetched successfully.");
  } catch (error) {
    console.error("Error fetching Quotation Formats:", error);
    return handleControllerError(res, error,
      error.message || "Failed to fetch Quotation Formats."
    );
  }
}

/**
 * Upserts a Quotation Format (Create or Update).
 */
// export async function upsertQuotationFormat(req, res) {
//   try {
//     const { quotation_format_id } = req.body; // Check body first for upsert
//     const builderId = req.user?.builder_id;
//     const companyId = req.user?.company_id;
//     const userId = req.user?.user_id;
//     const data = req.body;

//     const result = await quotationFormatService.upsertQuotationFormatService({
//       quotationFormatId: quotation_format_id || req.params.quotation_format_id,
//       builderId,
//       companyId,
//       userId,
//       data,
//     });

//     const action = (quotation_format_id || req.params.quotation_format_id) ? "updated" : "created";
//     return successResponse(res, result, `Quotation Format ${action} successfully.`);
//   } catch (error) {
//     console.error("Error upserting Quotation Format:", error);
//     return errorResponse(
//       res,
//       error.status || 500,
//       error.message || "Failed to save Quotation Format."
//     );
//   }
// }

export async function deleteQuotationFormat(req, res) {

  try {
    const { quotation_format_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    if (!quotation_format_id) {
      return errorResponse(res, 400, "quotation_format_id is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }
    const result = await quotationFormatService.deleteQuotationFormatsService({
      quotation_format_id
    });

    return successResponse(res, result, "Quotation Format deleted successfully.");
  } catch (error) {
    console.error("Error delete Quotation Format:", error);
    return handleControllerError(res, error,
      error.message || "Failed to delete Quotation Format."
    );
  }

}

export async function copyQuotationFormat(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;
    const { quotation_format_id } = req.params;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const result = await quotationFormatService.copyQuotationFormatService({
      quotationFormatId: quotation_format_id,
      builderId,
      companyId,
      userId,
    });

    return successResponse(res, result, "Quotation Format copied successfully.");
  } catch (error) {
    console.error("Error copying Quotation Format:", error);
    return handleControllerError(res, error,
      error.message || "Failed to copy Quotation Format."
    );
  }
}

export default {
  createQuotationFormat,
  updateQuotationFormat,
  getQuotationFormatById,
  getAllQuotationFormats,
  deleteQuotationFormat,
  copyQuotationFormat
  // upsertQuotationFormat,
};