import { successResponse, errorResponse } from "../../helper/response.js";
import {
  captureLandingLeadService,
  captureSignupRequestService,
  captureDemoRequestService,
} from "./landing-lead.service.js";

export async function captureLandingLead(req, res) {
  try {
    const data = await captureLandingLeadService(req.body);
    return successResponse(res, data, "Enquiry received successfully");
  } catch (error) {
    console.error("Capture landing lead error:", error);
    return errorResponse(res, 500, "Could not record your enquiry. Please try again.");
  }
}

export async function captureSignupRequest(req, res) {
  try {
    const data = await captureSignupRequestService(req.body);
    return successResponse(
      res,
      data,
      "Thanks — your request is with our team. We'll email your login details once it's approved.",
    );
  } catch (error) {
    // "You already have an account" is the one thing the visitor can act on, so
    // it is passed through verbatim instead of being flattened into the generic
    // failure the way an unexpected error is.
    if (error.status === 409) return errorResponse(res, 409, error.message);
    console.error("Capture signup request error:", error);
    return errorResponse(res, 500, "Could not send your request. Please try again.");
  }
}

export async function captureDemoRequest(req, res) {
  try {
    const data = await captureDemoRequestService(req.body);
    return successResponse(
      res,
      data,
      "Thanks — we've got your demo request. Our team will be in touch to book a time.",
    );
  } catch (error) {
    console.error("Capture demo request error:", error);
    return errorResponse(res, 500, "Could not send your demo request. Please try again.");
  }
}

export default { captureLandingLead, captureSignupRequest, captureDemoRequest };
