
import db from "../../config/database/models/postgre-models/index.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

import {
  createJobWorkflowSettingService,
  updateJobWorkflowSettingService,
  getJobWorkflowSettingService,
} from "./jobWorkflowSettings.service.js";

// CREATE
export async function createJobWorkflowSetting(req, res) {
  const { sequelize } = db;
  const t = await sequelize.transaction();

  try {
    const result = await createJobWorkflowSettingService(req.body, req.user, t);

    await t.commit();
    return successResponse(
      res,
      keysToCamelCase(result.toJSON()),
      "Created successfully",
    );
  } catch (err) {
    await t.rollback();
    return errorResponse(res, 400, err.message);
  }
}

// UPDATE
export async function updateJobColorSetting(req, res) {
  const { sequelize } = db;
  const t = await sequelize.transaction();

  try {
    const result = await updateJobWorkflowSettingService(req.body, req.user, t);

    await t.commit();
    return successResponse(
      res,
      keysToCamelCase(result.toJSON()),
      "Updated successfully",
    );
  } catch (err) {
    await t.rollback();
    return errorResponse(res, 400, err.message);
  }
}

// GET
export async function getUserJobWorkflowSettings(req, res) {
  const { sequelize } = db;
  const t = await sequelize.transaction();

  try {
    const result = await getJobWorkflowSettingService(req.user, t);

    await t.commit();
    return successResponse(
      res,
      keysToCamelCase(result.toJSON()),
      "Fetched successfully",
    );
  } catch (err) {
    await t.rollback();
    return handleControllerError(res, err, err.message);
  }
}
