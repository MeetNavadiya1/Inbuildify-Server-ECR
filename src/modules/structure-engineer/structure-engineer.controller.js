import {
  getAllStructureEngineerService,
  getStructureEngineerByIdService,
  createStructureEngineerService,
  updateStructureEngineerService,
  deleteStructureEngineerService,
} from "./structure-engineer.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

export async function getAllStructureEngineer(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const { search } = req.query;

    const { engineers, total } = await getAllStructureEngineerService({
      builderId: req.user.builder_id,
      companyId: req.user.company_id,
      page,
      limit,
      search,
    });

    return successResponse(res, {
      engineers: keysToCamelCase(engineers),
      pagination: {
        totalRecords: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    }, "Structure Engineers fetched successfully.");
  } catch (err) {
    console.error("Error fetching Structure Engineers:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getStructureEngineerById(req, res) {
  try {
    const result = await getStructureEngineerByIdService(
      req.params.structure_engineer_id,
      req.user.builder_id,
      req.user.company_id,
    );

    return successResponse(res, keysToCamelCase(result), "Fetched successfully");
  } catch (err) {
    console.error("Error fetching Structure Engineer:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function createStructureEngineer(req, res) {
  try {
    const result = await createStructureEngineerService(req.body, req.user);

    return successResponse(res, keysToCamelCase(result), "Created successfully");
  } catch (err) {
    console.error("Error creating Structure Engineer:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateStructureEngineer(req, res) {
  try {
    const result = await updateStructureEngineerService(
      req.params.structure_engineer_id,
      req.body,
      req.user,
    );

    return successResponse(res, keysToCamelCase(result), "Updated successfully");
  } catch (err) {
    console.error("Error updating Structure Engineer:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteStructureEngineer(req, res) {
  try {
    await deleteStructureEngineerService(
      req.params.structure_engineer_id,
      req.user.builder_id,
      req.user.company_id,
    );

    return successResponse(res, null, "Deleted successfully");
  } catch (err) {
    console.error("Error deleting Structure Engineer:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}
