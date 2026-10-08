import db from "../../config/database/models/postgre-models/index.js";

export async function getBestFacadesService() {
  try {
    const result = await db.Facade.findAll({
      where: {
        best_faced: true,
        status: true // Assuming we only want active ones
      }
    });
    return result;
  } catch (error) {
    throw error;
  }
}

export default {
  getBestFacadesService
};
