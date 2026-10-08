import { successResponse, errorResponse } from "../../../helper/response.js";
import { listLeadsService, getLeadStatsService, listClientsService } from "./admin-lead.service.js";

const fail = (res, error, label) => {
  console.error(`${label} Error:`, error);
  return errorResponse(res, error.status || error.statusCode || 500, error.message || "Internal Server Error.");
};

export async function listLeads(req, res) {
  try {
    const data = await listLeadsService({ query: req.query });
    return successResponse(res, data, "Leads fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Leads");
  }
}

export async function getLeadStats(req, res) {
  try {
    const data = await getLeadStatsService({ query: req.query });
    return successResponse(res, data, "Lead stats fetched successfully.");
  } catch (error) {
    return fail(res, error, "Lead Stats");
  }
}

export async function listClients(req, res) {
  try {
    const data = await listClientsService({ query: req.query });
    return successResponse(res, data, "Clients fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Clients");
  }
}

export default { listLeads, getLeadStats, listClients };
