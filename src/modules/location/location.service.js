import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

/**
 * Get all locations
 */
export async function getAllLocationService(user, query) {
  const { builder_id, company_id } = user;
  const { status, name } = query;

  if (!builder_id) {
    const error = new Error("Unauthorized: Missing builder ID.");
    error.statusCode = 401;
    throw error;
  }

  const where = {
    builder_id,
  };

  if (company_id) {
    where.company_id = company_id;
  }

  if (status !== undefined) {
    if (status === "true" || status === "false" || typeof status === "boolean") {
      where.status = status === "true" || status === true;
    } else {
      const error = new Error("Status parameter must be 'true' or 'false'.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (name && name.trim() !== "") {
    where.name = {
      [Op.iLike]: `%${name.trim()}%`,
    };
  }

  return await db.Location.findAll({
    where,
    order: [["created_at", "DESC"]],
  });
}

/**
 * Create location
 */
export async function createLocationService(data, user) {
  const { builder_id, company_id, user_id } = user;
  const { name, status } = data;

  const dupCheck = await db.Location.findOne({
    where: {
      builder_id,
      is_sample_data: false,
      name: { [Op.iLike]: name },
    },
  });

  if (dupCheck) {
    const error = new Error("Location name already exists for this builder.");
    error.statusCode = 409;
    throw error;
  }

  return await db.Location.create({
    company_id,
    builder_id,
    name,
    status: status ?? true,
    created_by: user_id,
    updated_by: user_id,
  });
}

/**
 * Update location
 */
export async function updateLocationService(id, data, user) {
  const { builder_id, user_id } = user;
  const { name, status } = data;

  const location = await db.Location.findOne({
    where: {
      location_id: id,
      builder_id,
    },
  });

  if (!location) {
    const error = new Error("Location not found for this builder.");
    error.statusCode = 404;
    throw error;
  }

  // Preserve legacy validation rules
  const currentStatus = location.status;
  const statusInBody = status !== undefined;
  const requestedStatusTrue = status === true || status === "true";
  const requestedStatusFalse = status === false || status === "false";

  if (statusInBody && !requestedStatusTrue && !requestedStatusFalse) {
    const error = new Error("The 'status' field must be a boolean (true or false) or string 'true'/'false'.");
    error.statusCode = 400;
    throw error;
  }

  if (currentStatus === false && statusInBody && requestedStatusFalse) {
    const error = new Error("Location is already inactive. 'status' can only be updated to true from this state.");
    error.statusCode = 403;
    throw error;
  }

  // Duplicate name check if name is being changed
  if (name) {
    const dupCheck = await db.Location.findOne({
      where: {
        builder_id,
        is_sample_data: false,
        name: { [Op.iLike]: name },
        location_id: { [Op.ne]: id },
      },
    });

    if (dupCheck) {
      const error = new Error("Location name already exists for this builder.");
      error.statusCode = 409;
      throw error;
    }
  }

  const updateData = {
    updated_by: user_id,
    updated_at: new Date(),
  };

  if (name !== undefined) updateData.name = name;
  if (status !== undefined) updateData.status = requestedStatusTrue;

  return await location.update(updateData);
}

/**
 * Delete location
 */
export async function deleteLocationService(id, user) {
  const { builder_id } = user;

  if (!builder_id) {
    const error = new Error("Unauthorized: Missing builder ID.");
    error.statusCode = 401;
    throw error;
  }

  const location = await db.Location.findOne({
    where: {
      location_id: id,
      builder_id,
    },
  });

  if (!location) {
    const error = new Error("Location not found for this builder.");
    error.statusCode = 404;
    throw error;
  }

  return await location.destroy();
}

export default {
  getAllLocationService,
  createLocationService,
  updateLocationService,
  deleteLocationService,
};
