import db from "../../config/database/models/postgre-models/index.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Get all available timezones
 * @param {object} req
 * @param {object} res
 */
export async function getAllTimezones(req, res) {
  try {
    const timezones = await db.Timezones.findAll({
      order: [
        ["utc_offset_minutes", "ASC"],
        ["display_name", "ASC"],
      ],
    });

    return successResponse(
      res,
      {
        timezones: keysToCamelCase(timezones),
      },
      "Timezones fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching timezones:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export default {
  getAllTimezones,
};
