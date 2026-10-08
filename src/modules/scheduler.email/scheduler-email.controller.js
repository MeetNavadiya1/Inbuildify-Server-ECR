import { errorResponse, successResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getSchedulerEmailsService,
  updateSchedulerEmailService,
  toggleSchedulerEmailStatusService,
} from "./scheduler-email.service.js";

export async function updateSchedulerEmail(req, res) {
  try {
    const { scheduler_email_id } = req.params;
    const updated = await updateSchedulerEmailService(req.user, scheduler_email_id, req.body, req.file);

    return successResponse(
      res,
      keysToCamelCase(updated),
      "Scheduler email updated successfully.",
    );
  } catch (error) {
    console.error("Error updating scheduler email:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error.");
  }
}

export async function getSchedulerEmails(req, res) {
  try {
    const { scheduler_emails, counts, message } = await getSchedulerEmailsService(req.user, req.query);

    return successResponse(
      res,
      {
        scheduler_emails: keysToCamelCase(scheduler_emails),
        counts,
      },
      message,
    );
  } catch (error) {
    console.error("Error fetching scheduler emails:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}


export async function toggleSchedulerEmailStatus(req, res) {
  try {
    const { scheduler_email_id } = req.params;
    const { record, newStatus } = await toggleSchedulerEmailStatusService(req.user, scheduler_email_id);

    return successResponse(
      res,
      keysToCamelCase(record),
      `Scheduler email ${newStatus ? "activated" : "deactivated"} successfully.`,
    );
  } catch (error) {
    console.error("Error toggling scheduler email status:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error.");
  }
}


