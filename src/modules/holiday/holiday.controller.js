import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { getAllHolidaysService, createHolidayService, updateHolidayService } from "./holiday.service.js";

export async function createHoliday(req, res) {
  try {
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;
    const userId = req.user?.user_id;

    const data = await createHolidayService({
      companyId,
      builderId,
      userId,
      data: req.body,
    });

    return successResponse(res, data, "Holiday created successfully.");
  } catch (error) {
    console.error("Error creating holiday:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal Server Error",
    );
  }
}

export async function getAllHolidays(req, res) {
  try {
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;

    if (!companyId && !builderId) {
      return errorResponse(
        res,
        400,
        "Either company_id or builder_id must be present.",
      );
    }

    const result = await getAllHolidaysService({
      companyId,
      builderId,
      query: req.query,
    });

    return successResponse(res, result, "Holidays fetched successfully.");
  } catch (error) {
    console.error("Error fetching holidays:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}


export async function updateHoliday(req, res) {
  try {
    const { holiday_id } = req.params;
    const companyId = req.user.company_id;
    const builderId = req.user.builder_id;
    const userId = req.user.user_id;

    const data = await updateHolidayService({
      companyId,
      builderId,
      holidayId: holiday_id,
      userId,
      data: req.body,
    });

    return successResponse(res, data, "Holiday updated successfully.");
  } catch (error) {
    console.error("Error updating holiday:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal Server Error",
    );
  }
}
