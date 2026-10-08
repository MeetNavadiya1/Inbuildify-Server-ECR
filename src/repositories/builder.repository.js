import db from "../config/database/models/postgre-models/index.js";

/**
 * Get address details for a builder
 * @param {string} builderId
 * @returns {Promise<object|null>}
 */
export async function getBuilderAddress(builderId) {
  try {
    const builder = await db.Builder.findOne({
      where: { builder_id: builderId },
      include: [
        {
          model: db.Address,
          as: "address",
        },
      ],
    });

    return builder?.address ? builder.address.get({ plain: true }) : null;
  } catch (error) {
    console.error("Error in getBuilderAddress repository:", error);
    throw error;
  }
}

/**
 * Get address details for a company associated with a builder
 * @param {string} builderId
 * @returns {Promise<object|null>}
 */
export async function getCompanyAddress(builderId) {
  try {
    const company = await db.Company.findOne({
      where: { builder_id: builderId },
      include: [
        {
          model: db.Address,
          as: "address",
        },
      ],
    });

    return company?.address ? company.address.get({ plain: true }) : null;
  } catch (error) {
    console.error("Error in getCompanyAddress repository:", error);
    throw error;
  }
}

export default {
  getBuilderAddress,
  getCompanyAddress,
};
