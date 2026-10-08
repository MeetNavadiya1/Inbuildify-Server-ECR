import { successResponse, errorResponse } from "../../../helper/response.js";
import {
  listLandingLeadsService,
  getLandingLeadStatsService,
  releaseLandingLeadService,
  rejectLandingLeadService,
  reopenLandingLeadService,
} from "./admin-landing-lead.service.js";

const fail = (res, error, label) => {
  console.error(`${label} Error:`, error);
  return errorResponse(res, error.status || error.statusCode || 500, error.message || "Internal Server Error.");
};

export async function listLandingLeads(req, res) {
  try {
    const data = await listLandingLeadsService({ query: req.query });
    return successResponse(res, data, "Landing leads fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Landing Leads");
  }
}

export async function getLandingLeadStats(req, res) {
  try {
    const data = await getLandingLeadStatsService({ query: req.query });
    return successResponse(res, data, "Landing lead stats fetched successfully.");
  } catch (error) {
    return fail(res, error, "Landing Lead Stats");
  }
}

export async function releaseLandingLead(req, res) {
  try {
    const data = await releaseLandingLeadService({
      id: req.params.landing_lead_id,
      body: req.body || {},
      admin: req.admin,
    });
    return successResponse(res, data, "Enquiry released to the builder.");
  } catch (error) {
    return fail(res, error, "Release Landing Lead");
  }
}

export async function rejectLandingLead(req, res) {
  try {
    const data = await rejectLandingLeadService({
      id: req.params.landing_lead_id,
      body: req.body || {},
    });
    return successResponse(res, data, "Enquiry rejected.");
  } catch (error) {
    return fail(res, error, "Reject Landing Lead");
  }
}

export async function reopenLandingLead(req, res) {
  try {
    const data = await reopenLandingLeadService({ id: req.params.landing_lead_id });
    return successResponse(res, data, "Enquiry re-opened.");
  } catch (error) {
    return fail(res, error, "Reopen Landing Lead");
  }
}

export default {
  listLandingLeads,
  getLandingLeadStats,
  releaseLandingLead,
  rejectLandingLead,
  reopenLandingLead,
};
