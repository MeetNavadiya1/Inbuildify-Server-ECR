import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Create a new address
 * @param {Object} data - Address data from request body
 * @returns {Promise<Object>} Created address in camelCase
 */
export async function createAddressService(data) {
  const {
    country_id,
    state_id,
    address_line1,
    address_line2,
    city,
    zip_code,
  } = data;

  // Validation: country_id
  if (country_id) {
    const country = await db.Country.findByPk(country_id);
    if (!country) {
      const error = new Error("Invalid country id. country not found.");
      error.status = 400;
      throw error;
    }
  }

  // Validation: state_id
  if (state_id) {
    const state = await db.State.findByPk(state_id);
    if (!state) {
      const error = new Error("Invalid state_id. state not found.");
      error.status = 400;
      throw error;
    }
  }

  // Validation: address_line1
  if (!address_line1) {
    const error = new Error("Address Line 1 is required.");
    error.status = 400;
    throw error;
  }

  const transaction = await db.sequelize.transaction();
  try {
    const address = await db.Address.create(
      {
        country_id: country_id || null,
        state_id: state_id || null,
        address_line1,
        address_line2: address_line2 || null,
        city: city || null,
        zip_code: zip_code || null,
      },
      { transaction },
    );

    await transaction.commit();
    return keysToCamelCase(address.toJSON());
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
