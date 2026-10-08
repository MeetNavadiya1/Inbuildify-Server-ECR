import leadsContactMapService from "./leads-contact-map.service.js";
import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";

export async function createLeadContactMap(req, res) {
  try {
    const { leads_id, contact_id } = req.body;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const data = await leadsContactMapService.createLeadContactMap(
      leads_id,
      contact_id,
      builderId,
      companyId
    );

    return successResponse(res, data, 201, "Contact mapped to lead successfully");
  } catch (error) {
    console.error("Create lead contact map error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getContactsByLeadId(req, res) {
  try {
    const { leads_id } = req.params;
    const data = await leadsContactMapService.getContactsByLeadId(req.user, leads_id);

    return successResponse(
      res,
      data,
      "Lead contacts fetched successfully"
    );
  } catch (error) {
    console.error("Get lead contacts error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function deleteLeadContactMap(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    await leadsContactMapService.deleteLeadContactMap(id, builderId, companyId);

    return successResponse(res, null, "Lead contact mapping deleted successfully");
  } catch (error) {
    console.error("Delete lead contact map error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export default {
  createLeadContactMap,
  getContactsByLeadId,
  deleteLeadContactMap,
};
