import * as serviceService from "./service.service.js";
import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";

export async function createService(req, res) {
  try {
    const result = await serviceService.createService(req.user, req.body);
    return successResponse(res, result, "Service created successfully.");
  } catch (error) {
    console.error("Create service error:", error);
    return handleControllerError(res, error, error.message || "Failed to create service.");
  }
}

export async function getServices(req, res) {
  try {
    const result = await serviceService.getServices(req.user);
    return successResponse(res, result, "Services retrieved successfully.");
  } catch (error) {
    console.error("Get services error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getServiceById(req, res) {
  try {
    const { service_id } = req.params;
    const result = await serviceService.getServiceById(req.user, service_id);
    return successResponse(res, result, "Service fetched successfully.");
  } catch (error) {
    console.error("Get service by ID error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateService(req, res) {
  try {
    const { service_id } = req.params;
    const result = await serviceService.updateService(req.user, service_id, req.body);
    return successResponse(res, result, "Service updated successfully.");
  } catch (error) {
    console.error("Error updating service:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteService(req, res) {
  try {
    const { service_id } = req.params;
    await serviceService.deleteService(req.user, service_id);
    return successResponse(res, {}, "Service deleted successfully.");
  } catch (error) {
    console.error("Error deleting service:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
