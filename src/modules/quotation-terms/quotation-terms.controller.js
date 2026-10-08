import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  getTermsService,
  saveTermsService,
  getSyncSummaryService,
  syncTermsService,
  getTermsForVersionService,
  getPublicTermsService,
} from "./quotation-terms.service.js";

/** Tenant + actor off the authenticated request, in one place. */
const actorOf = (req) => ({
  companyId: req.user?.company_id ?? null,
  builderId: req.user?.builder_id ?? null,
  userId: req.user?.users_id ?? req.user?.user_id ?? null,
});

// ─── Builder side ────────────────────────────────────────────────────────────

export async function getTerms(req, res) {
  try {
    const data = await getTermsService(actorOf(req));
    return successResponse(res, data, "Terms & Conditions fetched successfully.");
  } catch (error) {
    console.error("Get Quotation Terms Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

/** Save without publishing — the draft the builder is still editing. */
export async function saveTerms(req, res) {
  try {
    const data = await saveTermsService({ ...actorOf(req), payload: req.body, confirm: false });
    return successResponse(res, data, "Terms & Conditions saved successfully.");
  } catch (error) {
    console.error("Save Quotation Terms Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

/**
 * Confirm — saves, publishes and bumps the revision. The response is what the
 * preview panel renders, so the builder previews the sanitised, stored document
 * rather than their raw editor state.
 */
export async function confirmTerms(req, res) {
  try {
    const data = await saveTermsService({ ...actorOf(req), payload: req.body, confirm: true });
    return successResponse(res, data, "Terms & Conditions confirmed. Preview is up to date.");
  } catch (error) {
    console.error("Confirm Quotation Terms Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

// ─── Sync ────────────────────────────────────────────────────────────────────

/** Counts behind the Sync dialog's two choices. */
export async function getSyncSummary(req, res) {
  try {
    const data = await getSyncSummaryService(actorOf(req));
    return successResponse(res, data, "Sync summary fetched successfully.");
  } catch (error) {
    console.error("Quotation Terms Sync Summary Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function syncTerms(req, res) {
  try {
    const data = await syncTermsService({ ...actorOf(req), scope: req.body?.scope });
    const label =
      data.scope === "all"
        ? `Terms & Conditions synced to all ${data.processed} quotation(s).`
        : `Terms & Conditions added to ${data.created} quotation(s) that had none.`;
    return successResponse(res, data, data.processed ? label : "No quotations needed syncing.");
  } catch (error) {
    console.error("Quotation Terms Sync Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

// ─── Per-quotation lookup ────────────────────────────────────────────────────

export async function getTermsForVersion(req, res) {
  try {
    const { companyId, builderId } = actorOf(req);
    const data = await getTermsForVersionService({
      versionId: req.params.quotation_version_id,
      builderId,
      companyId,
    });
    if (!data) {
      return errorResponse(res, 404, "No Terms & Conditions are published for this quotation yet.");
    }
    return successResponse(res, data, "Quotation Terms & Conditions fetched successfully.");
  } catch (error) {
    console.error("Get Terms For Version Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

// ─── Public side ─────────────────────────────────────────────────────────────

/**
 * The customer-facing endpoint behind /terms/<token>. No auth: the token IS the
 * credential, and an unknown or unpublished token is a plain 404 so it cannot
 * be used to enumerate builders.
 */
export async function getPublicTerms(req, res) {
  try {
    const data = await getPublicTermsService(req.params.token);
    if (!data) {
      return errorResponse(res, 404, "These Terms & Conditions are not available.");
    }
    return successResponse(res, data, "Terms & Conditions fetched successfully.");
  } catch (error) {
    console.error("Get Public Terms Error:", error);
    return handleControllerError(res, error, "Internal Server Error.");
  }
}

export default {
  getTerms,
  saveTerms,
  confirmTerms,
  getSyncSummary,
  syncTerms,
  getTermsForVersion,
  getPublicTerms,
};
