import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createPropertyService,
  getPropertyByLeadIdService,
  updatePropertyService,
  deletePropertyService,
} from "./property.service.js";

export async function createProperty(req, res) {
  try {
    const { leads_id } = req.params;
    const propertyData = { ...req.body };

    // Handle file upload
    if (req.file) {
      propertyData.compaction_report_url = req.file.location;
    }

    const newProperty = await createPropertyService(
      leads_id,
      propertyData,
      req.user,
      req.file,
    );

    const formatted = keysToCamelCase(newProperty);

    return successResponse(res, formatted, "Property created successfully");
  } catch (error) {
    console.error("Error creating property:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

export async function getPropertyByLeadId(req, res) {
  try {
    const { leads_id } = req.params;
    const result = await getPropertyByLeadIdService(leads_id, req.user);

    if (!result) {
      return successResponse(res, null, "Property not found for this lead");
    }

    return successResponse(res, result, "Property fetched successfully");
  } catch (error) {
    console.error("Error fetching property:", error);
    return errorResponse(
      res,
      error?.status || 400,
      error?.message || "Internal Server Error",
    );
  }
}

export async function updateProperty(req, res) {
  try {
    const { property_detail_id } = req.params;
    const propertyData = { ...req.body };

    // Handle file upload
    if (req.file) {
      propertyData.compaction_report_url = req.file.location;
    }

    const updatedProperty = await updatePropertyService(
      property_detail_id,
      propertyData,
      req.file,
      req.user
    );

    const formatted = keysToCamelCase(updatedProperty);

    return successResponse(
      res,
      formatted,
      "Property updated successfully",
    );
  } catch (error) {
    console.error("Error updating property:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

export async function deleteProperty(req, res) {
  try {
    const { property_detail_id } = req.params;

    const result = await deletePropertyService(property_detail_id, req.user);

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, null, "Property deleted successfully");
  } catch (error) {
    console.error("Error deleting property:", error);
    return errorResponse(
      res,
      error?.status || 500,
      error?.message || "Internal Server Error",
    );
  }
}
