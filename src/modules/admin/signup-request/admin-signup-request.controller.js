import { successResponse, errorResponse } from "../../../helper/response.js";
import {
  listSignupRequestsService,
  getSignupRequestStatsService,
  releaseSignupRequestService,
  rejectSignupRequestService,
  reopenSignupRequestService,
} from "./admin-signup-request.service.js";

const fail = (res, error, label) => {
  console.error(`${label} Error:`, error);
  return errorResponse(res, error.status || error.statusCode || 500, error.message || "Internal Server Error.");
};

export async function listSignupRequests(req, res) {
  try {
    const data = await listSignupRequestsService({ query: req.query });
    return successResponse(res, data, "Sign-up requests fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Signup Requests");
  }
}

export async function getSignupRequestStats(req, res) {
  try {
    const data = await getSignupRequestStatsService();
    return successResponse(res, data, "Sign-up request stats fetched successfully.");
  } catch (error) {
    return fail(res, error, "Signup Request Stats");
  }
}

export async function releaseSignupRequest(req, res) {
  try {
    const data = await releaseSignupRequestService({
      id: req.params.landing_lead_id,
      body: req.body || {},
      admin: req.admin,
    });
    // An admin who unticked "email them" is not looking at a failure — only an
    // email that was attempted and did not go carries the warning.
    const emailWasAttempted = req.body?.send_email !== false;
    return successResponse(
      res,
      data,
      // eslint-disable-next-line no-nested-ternary
      data.emailQueued
        ? "Account created and the login details have been emailed."
        : emailWasAttempted
          ? "Account created, but the email could not be sent — pass the password on manually."
          : "Account created. No email was sent, so pass the password on yourself.",
    );
  } catch (error) {
    return fail(res, error, "Release Signup Request");
  }
}

export async function rejectSignupRequest(req, res) {
  try {
    const data = await rejectSignupRequestService({
      id: req.params.landing_lead_id,
      body: req.body || {},
    });
    return successResponse(res, data, "Request ignored.");
  } catch (error) {
    return fail(res, error, "Reject Signup Request");
  }
}

export async function reopenSignupRequest(req, res) {
  try {
    const data = await reopenSignupRequestService({ id: req.params.landing_lead_id });
    return successResponse(res, data, "Request re-opened.");
  } catch (error) {
    return fail(res, error, "Reopen Signup Request");
  }
}

export default {
  listSignupRequests,
  getSignupRequestStats,
  releaseSignupRequest,
  rejectSignupRequest,
  reopenSignupRequest,
};
