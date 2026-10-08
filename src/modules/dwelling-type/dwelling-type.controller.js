import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { createDwellingTypeService, deleteDwellingTypeService, getAllDwellingTypesService, updateDwellingTypeActiveService, updateDwellingTypeService } from "./dwellingType.service.js";

// GET
export async function getAllDwellingTypes(req, res) {
  try {
    const data = await getAllDwellingTypesService(req.user.builder_id);

    return successResponse(
      res,
      keysToCamelCase(data.map(d => d.toJSON())),
      "dwelling type fetched successfully",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// CREATE
export async function createDwellingType(req, res) {
  try {
    const data = await createDwellingTypeService(req.body, req.user);

    return successResponse(
      res,
      keysToCamelCase(data.toJSON()),
      "Dwelling type created successfully",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// UPDATE
export async function updateDwellingType(req, res) {
  try {
    const data = await updateDwellingTypeService(
      req.params.dwelling_type_id,
      req.body,
      req.user,
    );

    return successResponse(
      res,
      keysToCamelCase(data.toJSON()),
      "Dwelling type updated successfully",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// DELETE
export async function deleteDwellingType(req, res) {
  try {
    const data = await deleteDwellingTypeService(
      req.params.dwelling_type_id,
      req.user.builder_id,
    );

    return successResponse(
      res,
      keysToCamelCase(data.toJSON()),
      "Dwelling type deleted successfully",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// UPDATE ACTIVE
export async function updateDwellingTypeActive(req, res) {
  try {
    const data = await updateDwellingTypeActiveService(
      req.params.dwelling_type_id,
      req.body.is_active,
      req.user,
    );

    return successResponse(
      res,
      keysToCamelCase(data.toJSON()),
      "Dwelling type status updated successfully",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}
