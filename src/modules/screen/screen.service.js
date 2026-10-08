import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Fetches all screens ordered by creation date.
 */
export async function getScreensService() {
  const { Screen } = db;

  const screens = await Screen.findAll({
    attributes: ["screen_id", "name"],
    order: [["created_at", "DESC"]],
  });

  return {
    data: keysToCamelCase(screens.map((s) => s.get({ plain: true }))),
  };
}
