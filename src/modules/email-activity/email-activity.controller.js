import { errorResponse, successResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getEmailActivitiesService,
  getEmailActivityByIdService,
} from "./email-activity.service.js";

export async function getEmailActivities(req, res) {
  try {
    const { emailActivities, pagination, stats } = await getEmailActivitiesService(
      req.user,
      req.query,
    );

    return successResponse(
      res,
      {
        emailActivities: keysToCamelCase(emailActivities),
        pagination,
        stats,
      },
      "Email activities fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching email activities:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

export async function getEmailActivityById(req, res) {
  try {
    const { notifications_id } = req.params;
    const activity = await getEmailActivityByIdService(req.user, notifications_id);

    return successResponse(
      res,
      keysToCamelCase(activity),
      "Email activity fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching email activity:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error.");
  }
}
