import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Check if maintenance areas are enabled for a builder/company
 */
async function checkMaintenanceAreaEnabled(builderId, companyId) {
  const { MaintenanceSettings } = db;
  const settings = await MaintenanceSettings.findOne({
    where: {
      builder_id: builderId,
      company_id: companyId,
    },
    attributes: ["area_enabled"],
  });

  if (!settings || !settings.area_enabled) {
    throw {
      status: 403,
      message: "Maintenance areas are not enabled for this builder.",
    };
  }
}

/**
 * Create a new maintenance area
 */
export async function createMaintenanceArea(userContext, body) {
  const { MaintenanceArea } = db;
  const { builder_id: builderId, company_id: companyId, users_id: createdBy } = userContext;
  const { name } = body;

  if (!builderId && !companyId) {
    throw {
      status: 400,
      message: "Invalid user context. Missing builder or company ID.",
    };
  }

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Check if enabled
    await checkMaintenanceAreaEnabled(builderId, companyId);

    // 2. Check for duplicate name
    const existingArea = await MaintenanceArea.findOne({
      where: {
        name,
        is_sample_data: false,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      transaction,
    });

    if (existingArea) {
      throw { status: 400, message: "Maintenance area name already exists." };
    }

    // 3. Create area
    const newArea = await MaintenanceArea.create(
      {
        company_id: companyId,
        builder_id: builderId,
        name,
        created_by: createdBy,
        updated_by: createdBy,
      },
      { transaction },
    );

    await transaction.commit();
    return keysToCamelCase(newArea.toJSON());
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Get all maintenance areas with pagination
 */
export async function getAllMaintenanceAreas(userContext, query) {
  const { MaintenanceArea } = db;
  const { builder_id: builderId, company_id: companyId } = userContext;

  if (!builderId && !companyId) {
    throw {
      status: 400,
      message: "Invalid user context. Missing builder or company ID.",
    };
  }

  // Check if enabled
  await checkMaintenanceAreaEnabled(builderId, companyId);

  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 25;
  const offset = (page - 1) * limit;

  const { count, rows } = await MaintenanceArea.findAndCountAll({
    where: {
      [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
    },
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  const totalPages = Math.ceil(count / limit);

  return {
    maintenanceArea: keysToCamelCase(rows.map((row) => row.toJSON())),
    pagination: {
      totalRecords: count,
      currentPage: page,
      totalPages,
      limit,
    },
  };
}

/**
 * Update a maintenance area
 */
export async function updateMaintenanceArea(userContext, maintenanceAreaId, body) {
  const { MaintenanceArea } = db;
  const { builder_id: builderId, company_id: companyId, users_id: updatedBy } = userContext;
  const { name } = body;

  if (!builderId && !companyId) {
    throw {
      status: 400,
      message: "Invalid user context. Missing builder or company ID.",
    };
  }

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Check if enabled
    await checkMaintenanceAreaEnabled(builderId, companyId);

    // 2. Check ownership
    const area = await MaintenanceArea.findOne({
      where: {
        maintenance_area_id: maintenanceAreaId,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      transaction,
    });

    if (!area) {
      throw {
        status: 403,
        message: "You are not authorized to update this maintenance area.",
      };
    }

    // 3. Check name uniqueness if changed
    if (name && name !== area.name) {
      const duplicateArea = await MaintenanceArea.findOne({
        where: {
          name,
          is_sample_data: false,
          [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
          maintenance_area_id: { [Op.ne]: maintenanceAreaId },
        },
        transaction,
      });

      if (duplicateArea) {
        throw { status: 400, message: "Maintenance area name already exists." };
      }
    }

    // 4. Update
    await area.update(
      {
        name: name || area.name,
        updated_by: updatedBy,
      },
      { transaction },
    );

    await transaction.commit();
    return keysToCamelCase(area.toJSON());
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Delete a maintenance area
 */
export async function deleteMaintenanceArea(userContext, maintenanceAreaId) {
  const { MaintenanceArea } = db;
  const { builder_id: builderId, company_id: companyId } = userContext;

  if (!builderId && !companyId) {
    throw {
      status: 400,
      message: "Invalid user context. Missing builder or company ID.",
    };
  }

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Check if enabled
    await checkMaintenanceAreaEnabled(builderId, companyId);

    // 2. Check ownership
    const area = await MaintenanceArea.findOne({
      where: {
        maintenance_area_id: maintenanceAreaId,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      transaction,
    });

    if (!area) {
      throw {
        status: 403,
        message: "You are not authorized to delete this maintenance area.",
      };
    }

    // 3. Delete
    await area.destroy({ transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export default {
  createMaintenanceArea,
  getAllMaintenanceAreas,
  updateMaintenanceArea,
  deleteMaintenanceArea,
};
