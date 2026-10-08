import { successResponse, errorResponse } from "../../../helper/response.js";
import {
  listDemoRequestsService,
  getDemoRequestStatsService,
  markDemoRequestContactedService,
  rejectDemoRequestService,
  reopenDemoRequestService,
} from "./admin-demo-request.service.js";

const fail = (res, error, label) => {
  console.error(`${label} Error:`, error);
  return errorResponse(res, error.status || error.statusCode || 500, error.message || "Internal Server Error.");
};

export async function listDemoRequests(req, res) {
  try {
    const data = await listDemoRequestsService({ query: req.query });
    return successResponse(res, data, "Demo requests fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Demo Requests");
  }
}

export async function getDemoRequestStats(req, res) {
  try {
    const data = await getDemoRequestStatsService();
    return successResponse(res, data, "Demo request stats fetched successfully.");
  } catch (error) {
    return fail(res, error, "Demo Request Stats");
  }
}

export async function markDemoRequestContacted(req, res) {
  try {
    const data = await markDemoRequestContactedService({
      id: req.params.landing_lead_id,
      body: req.body || {},
      admin: req.admin,
    });
    return successResponse(res, data, "Marked as contacted.");
  } catch (error) {
    return fail(res, error, "Contact Demo Request");
  }
}

export async function rejectDemoRequest(req, res) {
  try {
    const data = await rejectDemoRequestService({
      id: req.params.landing_lead_id,
      body: req.body || {},
    });
    return successResponse(res, data, "Request dismissed.");
  } catch (error) {
    return fail(res, error, "Reject Demo Request");
  }
}

export async function reopenDemoRequest(req, res) {
  try {
    const data = await reopenDemoRequestService({ id: req.params.landing_lead_id });
    return successResponse(res, data, "Request put back in the queue.");
  } catch (error) {
    return fail(res, error, "Reopen Demo Request");
  }
}

export default {
  listDemoRequests,
  getDemoRequestStats,
  markDemoRequestContacted,
  rejectDemoRequest,
  reopenDemoRequest,
};
