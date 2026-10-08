
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

import {
  createJobInvoiceSettingService,
  updateJobInvoiceSettingService,
  getJobInvoiceSettingService,
} from "./job-Invoice-settings.service.js";

// CREATE
export async function createJobInvoiceSetting(req, res) {
  try {
    const result = await createJobInvoiceSettingService(req.body, req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Created successfully",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// UPDATE
export async function updateJobInvoiceSetting(req, res) {
  try {
    const result = await updateJobInvoiceSettingService(req.body, req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Updated successfully",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// GET
export async function getUserJobInvoiceSettings(req, res) {
  try {
    const result = await getJobInvoiceSettingService(req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Fetched successfully",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}
