import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getFloorPlansService,
  createFloorPlanService,
  updateFloorPlanService,
  deleteFloorPlanService,
  getFloorPlanFiltersService,
} from "./floor-plan.service.js";

export async function createFloorPlan(req, res) {
  try {
    const {
      name,
      min_land_width,
      min_land_depth,
      dwelling_area,
      dwelling_type_id,
      beds,
      baths,
      carpark,
      living,
      range_id,
      garage_area,
      porch_area,
      alfresco_area,
      total_area,
      description,
      status,
    } = req.body || {};

    // Get uploaded file objects from multer
    const detailed_file = req.files?.detailedImage?.[0] || null;
    const simple_file = req.files?.simpleImage?.[0] || null;

    const builder_id = req.user?.builder_id;
    const company_id = req.user?.company_id;
    const user_id = req.user?.user_id;

    const result = await createFloorPlanService({
      company_id,
      builder_id,
      name,
      min_land_width,
      min_land_depth,
      dwelling_area,
      dwelling_type_id,
      beds,
      baths,
      carpark,
      living,
      range_id,
      garage_area,
      porch_area,
      alfresco_area,
      total_area,
      detailed_file,
      simple_file,
      description,
      status,
      created_by: user_id,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Floor plan created successfully.",
    );
  } catch (error) {
    console.error("Create floor plan error:", error);
    const status = error.status || 500;
    const message = error.status ? error.message : "Failed to create floor plan.";
    return errorResponse(res, status, message);
  }
}

export async function getFloorPlans(req, res) {
  try {
    const builderId = req.user?.builder_id;

    const {
      page = 1,
      limit = 25,
      name,
      dwelling_type_id,
      range_id,
      location_id,
      status,
    } = req.query;

    const { floorPlans, pagination } = await getFloorPlansService({
      builder_id: builderId,
      page,
      limit,
      name,
      dwelling_type_id,
      range_id,
      location_id,
      status,
    });

    return successResponse(
      res,
      {
        floorPlans: keysToCamelCase(floorPlans),
        pagination,
      },
      "Floor plans fetched successfully.",
    );
  } catch (error) {
    console.error("Error getFloorplan:", error);
    return handleControllerError(res, error, "Something went wrong.");
  }
}

export async function updateFloorPlan(req, res) {
  try {
    const { floor_plan_id } = req.params;
    const body = typeof req.body === "object" && req.body !== null ? req.body : {};

    const {
      name,
      min_land_width,
      min_land_depth,
      dwelling_area,
      dwelling_type_id,
      beds,
      baths,
      carpark,
      living,
      range_id,
      location_id,
      garage_area,
      porch_area,
      alfresco_area,
      total_area,
      description,
      status,
    } = body;

    const detailed_file = req.files?.detailedImage?.[0] || null;
    const simple_file = req.files?.simpleImage?.[0] || null;

    const builder_id = req.user?.builder_id;
    const user_id = req.user?.user_id;

    // Convert string status to boolean if necessary
    let requestedStatus = status;
    if (status !== undefined) {
      if (status === "true") {
        requestedStatus = true;
      }
      if (status === "false") {
        requestedStatus = false;
      }
    }

    const result = await updateFloorPlanService({
      floor_plan_id,
      builder_id,
      payload: {
        name,
        min_land_width,
        min_land_depth,
        dwelling_area,
        dwelling_type_id,
        beds,
        baths,
        carpark,
        living,
        range_id,
        location_id,
        garage_area,
        porch_area,
        alfresco_area,
        total_area,
        description,
        status: requestedStatus,
        detailed_file,
        simple_file,
        detailed_image: body.detailed_image,
        simple_image: body.simple_image,
        updated_by: user_id,
      },
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Floor plan updated successfully.",
    );
  } catch (error) {
    console.error("Update floor plan error:", error);
    const status = error.status || 500;
    const message = error.status ? error.message : "Failed to update floor plan.";
    return errorResponse(res, status, message);
  }
}

export async function deleteFloorPlan(req, res) {
  try {
    const { floor_plan_id } = req.params;
    const builder_id = req.user?.builder_id;

    if (!floor_plan_id) {
      return errorResponse(res, 400, "Floor plan ID is required.");
    }

    await deleteFloorPlanService(floor_plan_id, builder_id);

    return successResponse(res, null, "Floor plan deleted successfully.");
  } catch (error) {
    console.error("Delete Floor Plan Error:", error);
    const status = error.status || 500;
    const message = error.status ? error.message : "Failed to delete floor plan.";
    return errorResponse(res, status, message);
  }
}
export async function getFloorPlanFilters(req, res) {
  try {
    const builderId = req.user.builder_id;

    if (!builderId) {
      return errorResponse(res, 400, "Builder ID not found.");
    }

    const filters = await getFloorPlanFiltersService(builderId);

    return successResponse(
      res,
      filters,
      "Floor plan filters fetched successfully.",
    );
  } catch (error) {
    console.error("Get floor plan filters error:", error);
    return handleControllerError(res, error, "Internal Server Error");
  }
}
