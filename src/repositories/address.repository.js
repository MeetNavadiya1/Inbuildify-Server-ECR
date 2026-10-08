import { Address } from "../config/database/models/postgre-models/address.model.js";
import db from "../config/database/models/postgre-models/index.js";

export async function createOrUpdateAddress(addressId, data, transaction = null) {
  const { address_line1, address_line2, city, zip_code, country_id, state_id } = data;
  console.log("bnm,ghjbnm");

  if (!addressId) {
    // CREATE
    const newAddress = await Address.create({
      address_line1,
      address_line2: address_line2 || null,
      city: city || null,
      zip_code: zip_code || null,
      country_id: country_id || null,
      state_id: state_id || null,
    }, { transaction });

    return newAddress.address_id;
  }

  // UPDATE — only update provided fields
  const updatePayload = {};

  if (address_line1 !== undefined) {
    updatePayload.address_line1 = address_line1;
  }
  if (address_line2 !== undefined) {
    updatePayload.address_line2 = address_line2;
  }
  if (city !== undefined) {
    updatePayload.city = city;
  }
  if (zip_code !== undefined) {
    updatePayload.zip_code = zip_code;
  }
  if (country_id !== undefined) {
    updatePayload.country_id = country_id;
  }
  if (state_id !== undefined) {
    updatePayload.state_id = state_id;
  }

  if (Object.keys(updatePayload).length > 0) {
    await Address.update(updatePayload, {
      where: { address_id: addressId },
      transaction,
    });
  }

  return addressId;
}

export default { createOrUpdateAddress };
