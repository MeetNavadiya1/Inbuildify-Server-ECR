import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import campaignService from "./campaign.service.js";
import db from "../../config/database/models/postgre-models/index.js";
import path from "path";
import { ensureUniqueDriveFileName } from "../../service/fileNaming.service.js";

export async function getCampaigns(req, res) {
  try {
    const result = await campaignService.getCampaigns(req.user, req.query);
    return successResponse(res, result);
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getCampaignStats(req, res) {
  try {
    const result = await campaignService.getCampaignStats(req.user);
    return successResponse(res, result);
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getCampaignById(req, res) {
  try {
    const result = await campaignService.getCampaignById(req.user, req.params.campaign_id);
    return successResponse(res, result);
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function createCampaign(req, res) {
  try {
    if (req.file) {
      req.body.attachment_url = req.file.location || req.file.key;
    }
    const result = await campaignService.createCampaign(req.user, req.body);
    
    if (req.file) {
      await db.DriveFile.create({
        original_name: req.file.originalname,
        // The key's basename is the administrator-configured name (s3Upload.js);
        // de-duplicate because file_name is UNIQUE.
        file_name: await ensureUniqueDriveFileName(
          req.file.key ? req.file.key.split("/").pop() : req.file.originalname,
        ),
        s3_key: req.file.key || req.file.location,
        file_extension: path.extname(req.file.originalname).toLowerCase(),
        mime_type: req.file.mimetype,
        size: req.file.size,
        company_id: req.user.company_id || null,
        builder_id: req.user.builder_id || null,
        uploaded_by: req.user.user_id,
        reference_id: result.campaignId,
        reference_type: "Campaign"
      });
    }

    return successResponse(res, result, "Campaign created successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateCampaign(req, res) {
  try {
    if (req.file) {
      req.body.attachment_url = req.file.location || req.file.key;
    }
    const result = await campaignService.updateCampaign(req.user, req.params.campaign_id, req.body);
    
    if (req.file) {
      await db.DriveFile.create({
        original_name: req.file.originalname,
        // The key's basename is the administrator-configured name (s3Upload.js);
        // de-duplicate because file_name is UNIQUE.
        file_name: await ensureUniqueDriveFileName(
          req.file.key ? req.file.key.split("/").pop() : req.file.originalname,
        ),
        s3_key: req.file.key || req.file.location,
        file_extension: path.extname(req.file.originalname).toLowerCase(),
        mime_type: req.file.mimetype,
        size: req.file.size,
        company_id: req.user.company_id || null,
        builder_id: req.user.builder_id || null,
        uploaded_by: req.user.user_id,
        reference_id: req.params.campaign_id,
        reference_type: "Campaign"
      });
    }

    return successResponse(res, result, "Campaign updated successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteCampaign(req, res) {
  try {
    const result = await campaignService.deleteCampaign(req.user, req.params.campaign_id);
    return successResponse(res, result, "Campaign deleted successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getFilteredContacts(req, res) {
  try {
    const result = await campaignService.getFilteredContacts(req.user, req.query);
    return successResponse(res, result);
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function saveContactSelection(req, res) {
  try {
    const result = await campaignService.saveContactSelection(req.user, req.params.campaign_id, req.body);
    return successResponse(res, result, "Contact selection saved.");
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function sendTestEmail(req, res) {
  try {
    const result = await campaignService.sendTestEmail(req.user, req.params.campaign_id, req.body);
    return successResponse(res, result, "Test email sent successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function sendCampaign(req, res) {
  try {
    const result = await campaignService.sendCampaign(req.user, req.params.campaign_id);
    return successResponse(res, result, "Campaign sent successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export default {
  getCampaigns,
  getCampaignStats,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getFilteredContacts,
  saveContactSelection,
  sendTestEmail,
  sendCampaign,
};
