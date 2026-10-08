import db from "../../config/database/models/postgre-models/index.js";

/**
 * FETCH ALL JOB PROCESS STAGE FUNCTIONALITIES
 */
export const getJobProcessStageFunctionalitiesService = async () => {
  const { JobProcessStageFunctionality } = db;

  const result = await JobProcessStageFunctionality.findAll({
    order: [["name", "ASC"]],
  });

  return result.map((r) => r.toJSON());
};

export default {
  getJobProcessStageFunctionalitiesService,
};
