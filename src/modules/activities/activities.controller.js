import activitiesService from "./activities.service.js";
import { errorResponse as internalServerError, successResponse } from "../../helper/response.js";

export const getGlobalActivitiesController = async (req, res) => {
  try {
    const filters = {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
      search: req.query.search || null,
      module: req.query.module || null,
    };
    
    const result = await activitiesService.getGlobalActivities(req.user, filters);

    if (result.success) {
      return successResponse(res, result.data, result.message);
    } else {
      return internalServerError(res, result.message);
    }
  } catch (error) {
    return internalServerError(res, error.message);
  }
};

export const getActivitiesTimelineController = async (req, res) => {
  try {
    const filters = {
      search: req.query.search || null,
      module: req.query.module || null,
    };

    const result = await activitiesService.getActivitiesTimeline(req.user, filters);

    if (result.success) {
      return successResponse(res, result.data, result.message);
    } else {
      return internalServerError(res, result.message);
    }
  } catch (error) {
    return internalServerError(res, error.message);
  }
};
