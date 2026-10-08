
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createPortalSettingsService,
  updatePortalSettingsService,
  getPortalSettingsService,
} from "./portal-settings.service.js";

// ─── Shared guard ─────────────────────────────────────────────────────────────

/** Returns true when both builder_id and company_id are absent from user context. */
function missingUserContext(builderId, companyId) {
  return !builderId && !companyId;
}

// ─── CREATE PORTAL SETTINGS ───────────────────────────────────────────────────

export async function createPortalSettings(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    // Resolve facade image: uploaded file takes precedence over body value
    const default_facade_image =
      req.file?.location || req.body.default_facade_image || null;

    const result = await createPortalSettingsService({
      builderId,
      companyId,
      userId,
      requestBody: req.body,
      default_facade_image,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Portal settings created successfully.");
  } catch (error) {
    console.error("Error creating portal settings:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── UPDATE PORTAL SETTINGS ───────────────────────────────────────────────────

export async function updatePortalSettings(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const updatedBy = req.user?.user_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const requestBody =
      req.body && typeof req.body === "object" ? req.body : {};

    // Resolve facade image: uploaded file takes precedence over body value
    const newFacadeImageUrl = req.file?.location || undefined;

    // Inject uploaded image URL into requestBody so service sees it as a provided field
    if (req.file?.location) {
      requestBody.default_facade_image = req.file.location;
    }

    const result = await updatePortalSettingsService({
      builderId,
      companyId,
      updatedBy,
      requestBody,
      newFacadeImageUrl,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("Error updating portal settings:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error.");
  }
}

// ─── GET PORTAL SETTINGS ──────────────────────────────────────────────────────

export async function getPortalSettings(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 400, "Invalid user context.");
    }

    const result = await getPortalSettingsService({ builderId, companyId, userId });

    return successResponse(res, result.data, "Portal settings fetched successfully.");
  } catch (error) {
    console.error("Error fetching portal settings:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}
