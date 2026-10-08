import db from "../../config/database/models/postgre-models/index.js";

/**
 * Fetches all conditions ordered by name ASC.
 * @returns {Promise<Array>} List of conditions
 */
export const getConditionsService = async () => {
  const { Conditions } = db;
  
  const conditions = await Conditions.findAll({
    order: [["name", "ASC"]],
  });

  return conditions.map((condition) => condition.get({ plain: true }));
};

export default {
  getConditionsService,
};
