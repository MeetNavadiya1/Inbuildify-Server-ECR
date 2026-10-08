import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  upsertBuilderService,
  getBuilderProfile,
  getAllBuildersService,
} from "./builder.service.js";

export async function upsertBuilder(req, res) {
  try {
    const builderId = req.user.builder_id;
    const logoUrl = req.file?.location || null;

    const builder = await upsertBuilderService(builderId, req.body, logoUrl);

    return successResponse(
      res,
      keysToCamelCase(builder),
      "Builder profile saved successfully",
    );
  } catch (err) {
    console.error(err);
    return errorResponse(res, 400, err.message);
  }
}

export async function getMyBuilderProfile(req, res) {
  try {
    const builderId = req.user?.builder_id;
    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const builder = await getBuilderProfile(builderId);

    if (!builder) {
      return errorResponse(res, 404, "Builder not found");
    }

    return successResponse(
      res,
      keysToCamelCase(builder),
      "Builder profile fetched successfully",
    );
  } catch (err) {
    console.error(err);
    return handleControllerError(res, err, "Failed to fetch builder profile");
  }
}

export async function getAllBuilders(req, res) {
  try {
    // Restrict the list to the caller's company so builders aren't leaked
    // across tenants.
    const builders = await getAllBuildersService(req.user?.company_id || null);

    return successResponse(
      res,
      keysToCamelCase(builders),
      "All builders fetched successfully",
    );
  } catch (err) {
    console.error(err);
    return handleControllerError(res, err, "Failed to fetch builders");
  }
}
