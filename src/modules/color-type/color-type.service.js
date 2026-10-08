import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Fetches all color types for a given company or builder.
 * Orders results by created_at in descending order and formats attributes.
 *
 * @param {Object} params - The context parameters.
 * @param {string} params.builderId - The builder ID.
 * @param {string} params.companyId - The company ID.
 * @returns {Promise<Array>} A promise that resolves to an array of formatted color type objects.
 */
export const getAllColorTypesService = async ({ builderId, companyId }) => {
  const { ColorType } = db;
  const { Op } = db.Sequelize;

  const colorTypes = await ColorType.findAll({
    where: {
      [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    },
    order: [["created_at", "DESC"]],
  });

  return colorTypes.map((ct) => {
    const data = keysToCamelCase(ct.toJSON());
    return {
      colorTypeId: data.colorTypeId,
      companyId: data.companyId,
      builderId: data.builderId,
      colorTypeName: data.colorTypeName,
      createdAt: null,
      updatedAt: null,
      createdBy: data.createdBy,
      updatedBy: data.updatedBy,
      // Seeded demo record — badged in the UI, and left out of the pickers on a
      // "create new" form (Settings → Sample Data clears it).
      isSampleData: data.isSampleData === true,
    };
  });
};

/**
 * Creates a new color type.
 */
export const createColorTypeService = async ({ builderId, companyId, colorTypeName, userId }) => {
  const { ColorType } = db;
  const { Op } = db.Sequelize;

  // 1. Duplicate check
  const duplicate = await ColorType.findOne({
    where: {
      [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
      color_type_name: colorTypeName.trim(),
      is_sample_data: false,
    },
  });

  if (duplicate) {
    const error = new Error("Color type name already exists.");
    error.status = 409;
    throw error;
  }

  // 2. Create
  const newColorType = await ColorType.create({
    company_id: companyId,
    builder_id: builderId,
    color_type_name: colorTypeName.trim(),
    created_by: userId,
    updated_by: userId,
  });

  const responseData = keysToCamelCase(newColorType.toJSON());

  // Parity refinement: Original sample shows null for createdAt/updatedAt
  return {
    ...responseData,
    createdAt: null,
    updatedAt: null,
  };
};

/**
 * Fetches a single color type by ID with creator and updater names.
 */
export const getColorTypeByIdService = async ({ builderId, companyId, id }) => {
  const { ColorType, Users } = db;
  const { Op } = db.Sequelize;

  const colorType = await ColorType.findOne({
    where: {
      color_type_id: id,
      [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    },
    include: [
      { model: Users, as: "createdByUser", attributes: ["name"] },
      { model: Users, as: "updatedByUser", attributes: ["name"] },
    ],
  });

  if (!colorType) {
    return null;
  }

  const data = keysToCamelCase(colorType.toJSON());
  return {
    colorTypeId: data.colorTypeId,
    companyId: data.companyId,
    builderId: data.builderId,
    colorTypeName: data.colorTypeName,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
    createdByName: data.createdByUser?.name || null,
    updatedByName: data.updatedByUser?.name || null,
  };
};

/**
 * Updates an existing color type.
 */
export const updateColorTypeService = async ({ builderId, companyId, id, colorTypeName, userId }) => {
  const { ColorType } = db;
  const { Op } = db.Sequelize;

  // 1. Fetch existing
  const colorType = await ColorType.findOne({
    where: {
      color_type_id: id,
      [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    },
  });

  if (!colorType) {
    const error = new Error("Color type not found.");
    error.status = 404;
    throw error;
  }

  // 2. Duplicate check if name changed
  if (colorTypeName && colorTypeName.trim() !== colorType.color_type_name) {
    const duplicate = await ColorType.findOne({
      where: {
        [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
        color_type_name: colorTypeName.trim(),
        is_sample_data: false,
        color_type_id: { [Op.ne]: id },
      },
    });

    if (duplicate) {
      const error = new Error("Color type name already exists.");
      error.status = 409;
      throw error;
    }
  }

  // 3. Update
  const updateData = {};
  if (colorTypeName !== undefined) {
    updateData.color_type_name = colorTypeName.trim();
  }
  updateData.updated_by = userId;

  await colorType.update(updateData);

  // Return full record for parity
  const responseData = keysToCamelCase(colorType.toJSON());
  return {
    ...responseData,
    createdAt: null,
  };
};

/**
 * Deletes a color type.
 */
export const deleteColorTypeService = async ({ builderId, companyId, id }) => {
  const { ColorType } = db;
  const { Op } = db.Sequelize;

  const colorType = await ColorType.findOne({
    where: {
      color_type_id: id,
      [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    },
  });

  if (!colorType) {
    const error = new Error("Color type not found.");
    error.status = 404;
    throw error;
  }

  await colorType.destroy();
  return true;
};

export default {
  getAllColorTypesService,
  createColorTypeService,
  getColorTypeByIdService,
  updateColorTypeService,
  deleteColorTypeService,
};
