import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Fetches estate features with dynamic pagination and builder scouting.
 */
export const getAllEstateFeaturesService = async ({ builderId, query }) => {
  const { EstateFeatures, Estate } = db;

  const {
    page = 1,
    limit = 25,
  } = query;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 25;
  const offset = (pageNum - 1) * limitNum;

  const { count: totalRecords, rows: features } = await EstateFeatures.findAndCountAll({
    include: [
      {
        model: Estate,
        as: "estate",
        where: { builder_id: builderId },
        attributes: [], // We only need the join for filtering
        required: true,
      },
    ],
    limit: limitNum,
    offset,
    order: [["createdAt", "DESC"]],
  });

  return {
    estateFeature: keysToCamelCase(features.map((f) => f.toJSON())),
    records: totalRecords,
    currentPage: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(totalRecords / limitNum),
  };
};

/**
 * Creates a new estate feature with authorization and duplicate checks.
 */
export const createEstateFeatureService = async ({ builderId, data }) => {
  const { EstateFeatures, Estate, sequelize } = db;
  const { estate_id, feature_name } = data;

  const transaction = await sequelize.transaction();
  try {
    // 1. Estate Existence and Builder Scoping
    const estate = await Estate.findOne({
      where: { estate_id, builder_id: builderId },
      transaction,
    });

    if (!estate) {
      const error = new Error("Estate not found or does not belong to this builder.");
      error.status = 404;
      throw error;
    }

    // 2. Active Status Check
    if (!estate.status) {
      const error = new Error("Inactive estate.");
      error.status = 404;
      throw error;
    }

    // 3. Duplicate Check (Case-insensitive)
    const duplicate = await EstateFeatures.findOne({
      where: {
        estate_id,
        feature_name: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("feature_name")),
          "=",
          feature_name.toLowerCase(),
        ),
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("Feature name already exists for this estate.");
      error.status = 409;
      throw error;
    }

    // 4. Creation
    const newFeature = await EstateFeatures.create(
      { estate_id, feature_name },
      { transaction },
    );

    await transaction.commit();

    return keysToCamelCase(newFeature.toJSON());
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Updates an existing estate feature with authorization and duplicate checks.
 */
export const updateEstateFeatureService = async ({ id, builderId, data }) => {
  const { EstateFeatures, Estate, sequelize, Sequelize } = db;
  const { Op } = Sequelize;
  const { feature_name } = data;

  const transaction = await sequelize.transaction();
  try {
    // 1. Validation & Scoping
    const existingFeature = await EstateFeatures.findOne({
      where: { estate_feature_id: id },
      include: [
        {
          model: Estate,
          as: "estate",
          where: { builder_id: builderId },
          required: true,
        },
      ],
      transaction,
    });

    if (!existingFeature) {
      const error = new Error("Estate feature not found or does not belong to this builder.");
      error.status = 404;
      throw error;
    }

    // 2. Active Status Check
    if (!existingFeature.estate.status) {
      const error = new Error("Inactive estate.");
      error.status = 404;
      throw error;
    }

    // 3. Duplicate Check (Case-insensitive)
    const duplicate = await EstateFeatures.findOne({
      where: {
        estate_id: existingFeature.estate_id,
        feature_name: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("feature_name")),
          "=",
          feature_name.toLowerCase(),
        ),
        estate_feature_id: { [Op.ne]: id },
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("Feature name already exists for this estate.");
      error.status = 409;
      throw error;
    }

    // 4. Update
    await existingFeature.update(
      { feature_name, updatedAt: new Date() },
      { transaction },
    );

    await transaction.commit();

    return keysToCamelCase(existingFeature.toJSON());
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Fetches estate features for a specific estate with ownership validation.
 */
export const getEstateFeaturesByEstateIdService = async (estateId, builderId) => {
  const { EstateFeatures, Estate } = db;

  // 1. Estate Existence and Builder Scoping
  const estate = await Estate.findOne({
    where: { estate_id: estateId, builder_id: builderId },
  });

  if (!estate) {
    const error = new Error("Estate not found or does not belong to this builder.");
    error.status = 404;
    throw error;
  }

  // 2. Fetch Features
  const features = await EstateFeatures.findAll({
    where: { estate_id: estateId },
    order: [["createdAt", "DESC"]],
  });

  return keysToCamelCase(features.map((f) => f.toJSON()));
};

/**
 * Deletes an estate feature with ownership validation.
 */
export const deleteEstateFeatureService = async (featureId, builderId) => {
  const { EstateFeatures, Estate, sequelize } = db;

  const transaction = await sequelize.transaction();
  try {
    // 1. Validation & Scoping
    const existingFeature = await EstateFeatures.findOne({
      where: { estate_feature_id: featureId },
      include: [
        {
          model: Estate,
          as: "estate",
          where: { builder_id: builderId },
          required: true,
        },
      ],
      transaction,
    });

    if (!existingFeature) {
      const error = new Error("Estate feature not found or does not belong to this builder.");
      error.status = 404;
      throw error;
    }

    // 2. Delete
    await existingFeature.destroy({ transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

export default {
  getAllEstateFeaturesService,
  createEstateFeatureService,
  getEstateFeaturesByEstateIdService,
  deleteEstateFeatureService,
  updateEstateFeatureService,
};
