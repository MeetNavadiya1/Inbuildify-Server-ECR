import agentReferralPartnerService from "./agent-referral-partner.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";

export async function createAgentReferralPartner(req, res) {
  const { sequelize } = db;
  try {
    const data = await sequelize.transaction(async (t) => {
      return await agentReferralPartnerService.createAgentReferralPartner(
        req.user,
        req.body,
        t.connection,
      );
    });

    const transformedData =
      await agentReferralPartnerService.transformAgentReferralPartnerResponse(data);

    return successResponse(res, transformedData, "Agent referral partner created successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function getAgentReferralPartnerById(req, res) {
  try {
    const { partner_id } = req.params;

    const data = await agentReferralPartnerService.getAgentReferralPartnerById(partner_id);

    const transformedData =
      await agentReferralPartnerService.transformAgentReferralPartnerResponse(data);

    return successResponse(res, transformedData, "Agent referral partner retrieved successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function getAgentReferralPartners(req, res) {
  try {
    const data = await agentReferralPartnerService.getAgentReferralPartners(
      req.user,
      req.query,
    );

    return successResponse(res, data.data, "Agent referral partners retrieved successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function updateAgentReferralPartner(req, res) {
  const { sequelize } = db;
  try {
    const { partner_id } = req.params;

    const data = await sequelize.transaction(async (t) => {
      return await agentReferralPartnerService.updateAgentReferralPartner(
        req.user,
        partner_id,
        req.body,
        t.connection,
      );
    });

    const transformedData =
      await agentReferralPartnerService.transformAgentReferralPartnerResponse(data);

    return successResponse(res, transformedData, "Agent referral partner updated successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function deleteAgentReferralPartner(req, res) {
  const { sequelize } = db;
  try {
    const { partner_id } = req.params;

    const data = await sequelize.transaction(async (t) => {
      return await agentReferralPartnerService.deleteAgentReferralPartner(
        req.user,
        partner_id,
        t.connection,
      );
    });

    return successResponse(res, keysToCamelCase(data), "Agent referral partner deleted successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export default {
  createAgentReferralPartner,
  getAgentReferralPartnerById,
  getAgentReferralPartners,
  updateAgentReferralPartner,
  deleteAgentReferralPartner,
};
