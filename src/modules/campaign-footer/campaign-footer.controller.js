import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import campaignFooterService from "./campaign-footer.service.js";

export async function createCampaignFooter(req, res) {
  try {
    const result = await campaignFooterService.createCampaignFooter(req.user, req.body);
    return successResponse(res, result, "Campaign footer created successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getCampaignFooters(req, res) {
  try {
    const result = await campaignFooterService.getCampaignFooters(req.user);
    return successResponse(res, result);
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getCampaignFooterById(req, res) {
  try {
    const result = await campaignFooterService.getCampaignFooterById(req.user, req.params.footer_id);
    return successResponse(res, result);
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateCampaignFooter(req, res) {
  try {
    const result = await campaignFooterService.updateCampaignFooter(req.user, req.params.footer_id, req.body);
    return successResponse(res, result, "Campaign footer updated successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteCampaignFooter(req, res) {
  try {
    const result = await campaignFooterService.deleteCampaignFooter(req.user, req.params.footer_id);
    return successResponse(res, result, "Campaign footer deleted successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export default {
  createCampaignFooter,
  getCampaignFooters,
  getCampaignFooterById,
  updateCampaignFooter,
  deleteCampaignFooter,
};
