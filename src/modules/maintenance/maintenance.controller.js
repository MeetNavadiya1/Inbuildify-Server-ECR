import maintenanceService from "./maintenance.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

export async function getAllMaintenance(req, res) {
  try {
    const result = await maintenanceService.getAllMaintenance(req.query, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getAllMaintenance error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getMaintenanceStats(req, res) {
  try {
    const result = await maintenanceService.getStats(req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getMaintenanceStats error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getMaintenanceById(req, res) {
  try {
    const { maintenance_id } = req.params;
    const result = await maintenanceService.getMaintenanceById(maintenance_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getMaintenanceById error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updateMaintenanceStatus(req, res) {
  try {
    const { maintenance_id } = req.params;
    const { status, comments } = req.body;
    const result = await maintenanceService.updateStatus(maintenance_id, status, comments, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("updateMaintenanceStatus error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function assignSupervisor(req, res) {
  try {
    const { maintenance_id } = req.params;
    const { supervisor_id } = req.body;
    const result = await maintenanceService.assignSupervisor(maintenance_id, supervisor_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("assignSupervisor error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function revertToConstruction(req, res) {
  try {
    const { maintenance_id } = req.params;
    const result = await maintenanceService.revertToConstruction(maintenance_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("revertToConstruction error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function createRequest(req, res) {
  try {
    const { maintenance_id } = req.params;

    // Parse descriptions array if it comes as a string in form-data
    if (typeof req.body.descriptions === "string") {
      try {
        req.body.descriptions = JSON.parse(req.body.descriptions);
      } catch (err) {
        // Leave as is, Joi will fail
      }
    }

    const payload = {
      ...req.body,
      attach_file: req.file?.location || null,
    };

    const result = await maintenanceService.createRequest(maintenance_id, payload, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("createRequest error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updateRequest(req, res) {
  try {
    const { request_id } = req.params;

    const payload = {
      ...req.body,
    };

    if (req.file?.location) {
      payload.attach_file = req.file.location;
    } else if (req.body.attach_file === "" || req.body.attach_file === null) {
      payload.attach_file = null;
    }

    const result = await maintenanceService.updateRequest(request_id, payload, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("updateRequest error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteRequest(req, res) {
  try {
    const { request_id } = req.params;
    const result = await maintenanceService.deleteRequest(request_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("deleteRequest error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function addRequestTask(req, res) {
  try {
    const { request_id } = req.params;
    const result = await maintenanceService.addRequestTask(request_id, req.body, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("addRequestTask error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updateRequestTask(req, res) {
  try {
    const { task_id } = req.params;
    const file = req.files?.file?.[0] || req.files?.image?.[0];

    if (file) {
      const uploadRes = await maintenanceService.uploadTaskAttachment(task_id, file, req.user);
      if (!uploadRes.success) {
        return errorResponse(res, uploadRes.statusCode || 400, uploadRes.message);
      }
    }

    const updateData = { ...req.body };
    delete updateData.file;
    delete updateData.image;

    let result;
    if (Object.keys(updateData).length > 0) {
      result = await maintenanceService.updateRequestTask(task_id, updateData, req.user);
    } else {
      const task = await maintenanceService._findTaskScoped(task_id, req.user);
      if (!task) return errorResponse(res, 404, "Task not found or unauthorized");
      result = { success: true, data: keysToCamelCase(task.get({ plain: true })), message: "Task updated" };
    }

    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("updateRequestTask error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteRequestTask(req, res) {
  try {
    const { task_id } = req.params;
    const result = await maintenanceService.deleteRequestTask(task_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("deleteRequestTask error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function notify(req, res) {
  try {
    const { maintenance_id } = req.params;
    const result = await maintenanceService.notify(maintenance_id, req.body, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("notify error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function bookingReminder(req, res) {
  try {
    const { maintenance_id } = req.params;
    const { filter } = req.body;
    const result = await maintenanceService.bookingReminder(maintenance_id, filter, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("bookingReminder error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getDocuments(req, res) {
  try {
    const { maintenance_id } = req.params;
    const result = await maintenanceService.getDocuments(maintenance_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getDocuments error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function uploadDocument(req, res) {
  try {
    const { maintenance_id } = req.params;
    const { sub_reference_type, sub_reference_id } = req.body;

    if (!req.file) return errorResponse(res, 400, "File is required.");

    const result = await maintenanceService.uploadDocument(
      maintenance_id,
      req.file,
      req.user,
      sub_reference_type || null,
      sub_reference_id || null,
    );
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("uploadDocument error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteDocument(req, res) {
  try {
    const { file_id } = req.params;
    const result = await maintenanceService.deleteDocument(file_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("deleteDocument error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getSiteImages(req, res) {
  try {
    const { maintenance_id } = req.params;
    const result = await maintenanceService.getSiteImages(maintenance_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getSiteImages error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function uploadSiteImage(req, res) {
  try {
    const { maintenance_id } = req.params;

    if (!req.file) return errorResponse(res, 400, "Image file is required.");

    const result = await maintenanceService.uploadSiteImage(maintenance_id, req.file, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("uploadSiteImage error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteSiteImage(req, res) {
  try {
    const { file_id } = req.params;
    const result = await maintenanceService.deleteSiteImage(file_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("deleteSiteImage error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getTaskAttachments(req, res) {
  try {
    const { task_id } = req.params;
    const result = await maintenanceService.getTaskAttachments(task_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getTaskAttachments error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function uploadTaskAttachment(req, res) {
  try {
    const { task_id } = req.params;

    if (!req.file) return errorResponse(res, 400, "Attachment file is required.");

    const result = await maintenanceService.uploadTaskAttachment(task_id, req.file, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("uploadTaskAttachment error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteTaskAttachment(req, res) {
  try {
    const { file_id } = req.params;
    const result = await maintenanceService.deleteTaskAttachment(file_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("deleteTaskAttachment error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getActivityLog(req, res) {
  try {
    const { maintenance_id } = req.params;
    const { page, limit } = req.query;
    const result = await maintenanceService.getActivityLog(maintenance_id, req.user, { page, limit });
    if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getActivityLog error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}
