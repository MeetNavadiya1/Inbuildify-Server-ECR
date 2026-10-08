import { successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getConfigService,
  calculateService,
  checkFormulaService,
  loadTemplateService,
  createParameterService,
  updateParameterService,
  deleteParameterService,
  createMaterialService,
  updateMaterialService,
  deleteMaterialService,
  getJobEstimateService,
  calculateJobEstimateService,
  saveJobEstimateValuesService,
} from "./estimate.service.js";

/** The job id off the route — declared as `:job_id`, see estimate.routes.js. */
const jobIdOf = (req) => req.params.job_id;

/**
 * The admin's answer to "Apply changes to existing jobs?".
 *
 * Writes carry it in the body, a DELETE in the query string. Left out
 * altogether it stays `undefined`, which the service reads as "no choice was
 * made" and leaves existing jobs arranged exactly as they are — not the same
 * thing as answering Yes.
 */
const applyToExistingOf = (req) => {
  const raw = req.body?.apply_to_existing_jobs ?? req.query?.apply_to_existing_jobs;
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  return raw === true || raw === "true";
};

/** Tenant + actor off the authenticated request, in one place. */
const actorOf = (req) => ({
  companyId: req.user?.company_id ?? null,
  builderId: req.user?.builder_id ?? null,
  userId: req.user?.users_id ?? req.user?.user_id ?? null,
});

/**
 * Two requests racing to claim the same variable get past the service's check
 * together and one of them hits the unique index. Say what happened instead of
 * answering with a bare 500.
 */
const handleError = (res, error, fallback) => {
  if (error?.name === "SequelizeUniqueConstraintError") {
    error.statusCode = 409;
    error.message = "That variable name is already in use. Choose another one.";
  }
  return handleControllerError(res, error, error?.message || fallback);
};

export async function getEstimateConfig(req, res) {
  try {
    const data = await getConfigService(actorOf(req));
    return successResponse(res, keysToCamelCase(data), "Estimation settings fetched successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to fetch estimation settings.");
  }
}

export async function calculateEstimate(req, res) {
  try {
    const data = await calculateService(actorOf(req), req.body.values);
    return successResponse(res, keysToCamelCase(data), "Estimate calculated successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to calculate the estimate.");
  }
}

export async function checkFormula(req, res) {
  try {
    const data = await checkFormulaService(actorOf(req), req.body);
    return successResponse(res, keysToCamelCase(data), data.valid ? "Formula is valid." : "Formula is invalid.");
  } catch (error) {
    return handleError(res, error, "Failed to check the formula.");
  }
}

export async function loadStarterTemplate(req, res) {
  try {
    const data = await loadTemplateService(actorOf(req), applyToExistingOf(req));
    return successResponse(res, keysToCamelCase(data), "Starter template loaded.");
  } catch (error) {
    return handleError(res, error, "Failed to load the starter template.");
  }
}

// ─── Job-wise estimates ──────────────────────────────────────────────────────

export async function getJobEstimate(req, res) {
  try {
    const data = await getJobEstimateService(actorOf(req), jobIdOf(req));
    return successResponse(res, keysToCamelCase(data), "Job estimate fetched successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to fetch the job estimate.");
  }
}

export async function calculateJobEstimate(req, res) {
  try {
    const data = await calculateJobEstimateService(actorOf(req), jobIdOf(req), req.body.values);
    return successResponse(res, keysToCamelCase(data), "Job estimate calculated successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to calculate the job estimate.");
  }
}

export async function saveJobEstimateValues(req, res) {
  try {
    const data = await saveJobEstimateValuesService(actorOf(req), jobIdOf(req), req.body.values);
    return successResponse(res, keysToCamelCase(data), "Job estimate saved successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to save the job estimate.");
  }
}

// ─── Parameters ──────────────────────────────────────────────────────────────

export async function createParameter(req, res) {
  try {
    const data = await createParameterService(actorOf(req), req.body, applyToExistingOf(req));
    return successResponse(res, keysToCamelCase(data), "Parameter created successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to create the parameter.");
  }
}

export async function updateParameter(req, res) {
  try {
    const data = await updateParameterService(actorOf(req), req.params.id, req.body, applyToExistingOf(req));
    return successResponse(res, keysToCamelCase(data), "Parameter updated successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to update the parameter.");
  }
}

export async function deleteParameter(req, res) {
  try {
    const data = await deleteParameterService(actorOf(req), req.params.id, applyToExistingOf(req));
    return successResponse(res, data, "Parameter deleted successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to delete the parameter.");
  }
}

// ─── Materials ───────────────────────────────────────────────────────────────

export async function createMaterial(req, res) {
  try {
    const data = await createMaterialService(actorOf(req), req.body, applyToExistingOf(req));
    return successResponse(res, keysToCamelCase(data), "Material created successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to create the material.");
  }
}

export async function updateMaterial(req, res) {
  try {
    const data = await updateMaterialService(actorOf(req), req.params.id, req.body, applyToExistingOf(req));
    return successResponse(res, keysToCamelCase(data), "Material updated successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to update the material.");
  }
}

export async function deleteMaterial(req, res) {
  try {
    const data = await deleteMaterialService(actorOf(req), req.params.id, applyToExistingOf(req));
    return successResponse(res, data, "Material deleted successfully.");
  } catch (error) {
    return handleError(res, error, "Failed to delete the material.");
  }
}
