import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import {
  getAllEstateStagesService,
  createEstateStageService,
  updateEstateStageService,
  deleteEstateStageService,
} from "./estate-stage.service.js";

export async function createEstateStage(req, res) {
  try {
    const { estate_id, name, release_date } = req.body;
    const attach_file = req.files?.attachFile?.map(file => file.location) ||
                      (req.body.attach_file ? [req.body.attach_file] : []);

    const builderId = req.user?.builder_id;

    const data = await createEstateStageService({
      builderId,
      data: {
        estate_id,
        name,
        release_date,
        attach_file: attach_file.length > 0 ? attach_file : null,
      },
    });

    return successResponse(
      res,
      data,
      "Estate stage created successfully.",
    );
  } catch (err) {
    console.error("Create estate stage error:", err);
    return handleControllerError(res, err,
      err.message || "Failed to create estate stage.",
    );
  }
}

export async function getAllEstateStages(req, res) {
  try {
    const builderId = req.user?.builder_id;

    const data = await getAllEstateStagesService({
      builderId,
      query: req.query,
    });

    return successResponse(res, data);
  } catch (err) {
    console.error("Get all estate stages error:", err);
    return handleControllerError(res, err, "Failed to fetch estate stages.");
  }
}
//not used
export async function deleteEstateStage(req, res) {
  try {
    const { estate_stage_id } = req.params;
    const builderId = req.user?.builder_id;

    if (!estate_stage_id) {
      return errorResponse(res, 400, "estate_stage_id is required.");
    }

    await deleteEstateStageService({
      stageId: estate_stage_id,
      builderId,
    });

    return successResponse(res, null, "Estate stage deleted successfully.");
  } catch (error) {
    console.error("Delete estate stage error:", error);
    return handleControllerError(res, error,
      error.message || "Failed to delete estate stage.",
    );
  }
}

export async function updateEstateStage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { estate_stage_id } = req.params;
    const uploadedFiles = req.files?.attachFile?.map(file => file.location) || [];

    const data = await updateEstateStageService({
      builderId,
      stageId: estate_stage_id,
      data: req.body,
      uploadedFiles,
    });

    return successResponse(
      res,
      data,
      "Estate stage updated successfully.",
    );
  } catch (error) {
    console.error("Error updating estate stage:", error);
    return handleControllerError(res, error,
      error.message || "Something went wrong",
    );
  }
}
