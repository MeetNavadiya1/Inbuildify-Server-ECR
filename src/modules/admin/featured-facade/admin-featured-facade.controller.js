import { successResponse, errorResponse } from "../../../helper/response.js";
import {
  listFeaturedFacadeRequestsService,
  getFeaturedFacadeStatsService,
  getLandingOrderService,
  reorderFeaturedFacadesService,
  createFeaturedFacadeService,
  approveFeaturedFacadeRequestService,
  rejectFeaturedFacadeRequestService,
  reopenFeaturedFacadeRequestService,
  removeFeaturedFacadeService,
} from "./admin-featured-facade.service.js";

const fail = (res, error, label) => {
  console.error(`${label} Error:`, error);
  return errorResponse(res, error.status || error.statusCode || 500, error.message || "Internal Server Error.");
};

export async function listFeaturedFacadeRequests(req, res) {
  try {
    const data = await listFeaturedFacadeRequestsService({ query: req.query });
    return successResponse(res, data, "Featured facade requests fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Featured Facade Requests");
  }
}

export async function getFeaturedFacadeStats(req, res) {
  try {
    const data = await getFeaturedFacadeStatsService();
    return successResponse(res, data, "Featured facade stats fetched successfully.");
  } catch (error) {
    return fail(res, error, "Featured Facade Stats");
  }
}

export async function getLandingOrder(req, res) {
  try {
    const data = await getLandingOrderService();
    return successResponse(res, data, "Landing page order fetched successfully.");
  } catch (error) {
    return fail(res, error, "Landing Facade Order");
  }
}

export async function reorderFeaturedFacades(req, res) {
  try {
    const data = await reorderFeaturedFacadesService({ ids: req.body.order });
    return successResponse(res, data, "Landing page order saved.");
  } catch (error) {
    return fail(res, error, "Reorder Featured Facades");
  }
}

export async function createFeaturedFacade(req, res) {
  try {
    const data = await createFeaturedFacadeService({
      body: req.body || {},
      admin: req.admin,
    });
    return successResponse(res, data, "Facade featured on the landing page.");
  } catch (error) {
    return fail(res, error, "Create Featured Facade");
  }
}

export async function approveFeaturedFacadeRequest(req, res) {
  try {
    const data = await approveFeaturedFacadeRequestService({
      id: req.params.featur_facade_id,
      body: req.body || {},
      admin: req.admin,
    });
    return successResponse(res, data, "Facade approved for the landing page.");
  } catch (error) {
    return fail(res, error, "Approve Featured Facade");
  }
}

export async function rejectFeaturedFacadeRequest(req, res) {
  try {
    const data = await rejectFeaturedFacadeRequestService({
      id: req.params.featur_facade_id,
      body: req.body || {},
      admin: req.admin,
    });
    return successResponse(res, data, "Request rejected — the facade stays off the landing page.");
  } catch (error) {
    return fail(res, error, "Reject Featured Facade");
  }
}

export async function reopenFeaturedFacadeRequest(req, res) {
  try {
    const data = await reopenFeaturedFacadeRequestService({
      id: req.params.featur_facade_id,
    });
    return successResponse(res, data, "Request put back in the queue.");
  } catch (error) {
    return fail(res, error, "Reopen Featured Facade");
  }
}

export async function removeFeaturedFacade(req, res) {
  try {
    const data = await removeFeaturedFacadeService({
      id: req.params.featur_facade_id,
    });
    return successResponse(res, data, "Removed from the landing page.");
  } catch (error) {
    return fail(res, error, "Remove Featured Facade");
  }
}

export default {
  listFeaturedFacadeRequests,
  getFeaturedFacadeStats,
  getLandingOrder,
  reorderFeaturedFacades,
  createFeaturedFacade,
  approveFeaturedFacadeRequest,
  rejectFeaturedFacadeRequest,
  reopenFeaturedFacadeRequest,
  removeFeaturedFacade,
};
