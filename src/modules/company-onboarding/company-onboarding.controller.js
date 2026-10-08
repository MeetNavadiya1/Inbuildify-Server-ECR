import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import companyOnboardingService from "./company-onboarding.service.js";

export async function companySignUp(req, res) {
  try {
    const data = await companyOnboardingService.companySignUp(req.body);
    return successResponse(
      res,
      data,
      "Company registered. Verify your email with the OTP we just sent, then complete onboarding.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function completeCompanyOnboarding(req, res) {
  try {
    const { id } = req.params;
    const requesterCompanyId = req.user?.company_id || null;
    const data = await companyOnboardingService.completeCompanyOnboarding(
      id,
      req.body,
      requesterCompanyId,
    );
    return successResponse(res, data, "Company onboarding completed successfully.");
  } catch (err) {
    return errorResponse(res, err.statusCode || err.status || 500, err.message);
  }
}

export async function restoreSampleData(req, res) {
  try {
    const { company_id, builder_id } = req.user;
    // Queued, not run here: the clone takes seconds to minutes. The returned
    // request row is what the UI polls, the same as an import or a sync.
    const result = await companyOnboardingService.requestSampleDataRestore(
      company_id,
      builder_id,
      req.user,
    );
    return successResponse(
      res,
      result,
      "Restoring — your sample data is being rebuilt in the background.",
    );
  } catch (err) {
    return errorResponse(res, err.statusCode || err.status || 500, err.message);
  }
}

export async function getSampleDataSummary(req, res) {
  try {
    const { company_id, builder_id } = req.user;
    // Their own sample data, not the company's — see resolveSampleDataOwnerId.
    const ownerId = await companyOnboardingService.resolveSampleDataOwnerId(req.user);
    const data = await companyOnboardingService.getCompanySampleDataSummary(
      company_id,
      builder_id,
      ownerId,
    );
    return successResponse(res, data, "Sample data summary fetched successfully.");
  } catch (err) {
    return errorResponse(res, err.statusCode || err.status || 500, err.message);
  }
}

export async function deleteSampleData(req, res) {
  try {
    const { company_id, builder_id } = req.user;
    // Scoped to the caller. Every user under a company shares its builder_id, so
    // without this a user created by the Company Administrator cleared the demo
    // data out of every colleague's account along with their own. An
    // administrator resolves to null, which is the company-wide clean-up.
    const ownerId = await companyOnboardingService.resolveSampleDataOwnerId(req.user);
    const data = await companyOnboardingService.removeCompanySampleData(
      company_id,
      builder_id,
      ownerId,
    );
    return successResponse(
      res,
      data,
      data.removed ? "Sample data deleted successfully." : "No sample data to delete.",
    );
  } catch (err) {
    return errorResponse(res, err.statusCode || err.status || 500, err.message);
  }
}

/* ─── SAMPLE DATA REQUEST / APPROVAL ──────────────────────────── */

export async function getSampleDataRequest(req, res) {
  try {
    const { company_id, builder_id, users_id } = req.user;
    const data = await companyOnboardingService.getLatestSampleDataRequest(
      company_id,
      builder_id,
      users_id,
    );
    return successResponse(res, data, "Sample data request fetched successfully.");
  } catch (err) {
    return errorResponse(res, err.statusCode || err.status || 500, err.message);
  }
}

export async function requestSampleData(req, res) {
  try {
    const { company_id, builder_id } = req.user;
    const data = await companyOnboardingService.createSampleDataRequest(
      company_id,
      builder_id,
      req.user,
    );
    return successResponse(
      res,
      data,
      "Request sent to your Company Administrator for approval.",
    );
  } catch (err) {
    return errorResponse(res, err.statusCode || err.status || 500, err.message);
  }
}

export async function syncSampleData(req, res) {
  try {
    const { company_id, builder_id } = req.user;
    const data = await companyOnboardingService.requestSampleDataSync(
      company_id,
      builder_id,
      req.user,
    );
    return successResponse(
      res,
      data,
      "Syncing — any new demo records are being added in the background.",
    );
  } catch (err) {
    return errorResponse(res, err.statusCode || err.status || 500, err.message);
  }
}

export async function decideSampleDataRequest(req, res) {
  try {
    const { decision, note } = req.body;
    if (!["APPROVE", "REJECT"].includes(decision)) {
      return errorResponse(res, 400, "decision must be APPROVE or REJECT.");
    }

    const data = await companyOnboardingService.decideSampleDataRequest(
      req.params.id,
      decision,
      note,
      req.user,
    );
    return successResponse(
      res,
      data,
      decision === "APPROVE"
        ? "Approved — the sample data is importing in the background."
        : "Sample data request declined.",
    );
  } catch (err) {
    return errorResponse(res, err.statusCode || err.status || 500, err.message);
  }
}

/**
 * Public — reached from the emailed approval link. The per-request token in the
 * path is the only credential, so the approver never has to log in.
 */
export async function getSampleDataRequestByToken(req, res) {
  try {
    const data = await companyOnboardingService.getSampleDataRequestByToken(
      req.params.token,
    );
    return successResponse(res, data, "Sample data request fetched successfully.");
  } catch (err) {
    return errorResponse(res, err.statusCode || err.status || 500, err.message);
  }
}

export async function decideSampleDataRequestByToken(req, res) {
  try {
    const { decision, note } = req.body;
    if (!["APPROVE", "REJECT"].includes(decision)) {
      return errorResponse(res, 400, "decision must be APPROVE or REJECT.");
    }

    const data = await companyOnboardingService.decideSampleDataRequestByToken(
      req.params.token,
      decision,
      note,
    );
    return successResponse(
      res,
      data,
      decision === "APPROVE"
        ? "Approved — the sample data is importing in the background."
        : "Sample data request declined.",
    );
  } catch (err) {
    return errorResponse(res, err.statusCode || err.status || 500, err.message);
  }
}

export default {
  companySignUp,
  completeCompanyOnboarding,
  restoreSampleData,
  getSampleDataSummary,
  deleteSampleData,
  getSampleDataRequest,
  requestSampleData,
  syncSampleData,
  decideSampleDataRequest,
  getSampleDataRequestByToken,
  decideSampleDataRequestByToken,
};
