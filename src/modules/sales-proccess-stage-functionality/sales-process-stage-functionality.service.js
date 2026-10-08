import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Service to fetch all sales process stage functionalities
 */
export async function getSalesProcessStageFunctionalitiesService() {
  const { SalesProcessStageFunctionality } = db;

  const result = await SalesProcessStageFunctionality.findAll({
    attributes: ["functionality_id", "name"],
    order: [["name", "ASC"]],
  });

  // Convert to plain objects and apply camelCasing to match previous API response
  return result.map((x) => keysToCamelCase(x.get({ plain: true })));
}

export default {
  getSalesProcessStageFunctionalitiesService,
};
