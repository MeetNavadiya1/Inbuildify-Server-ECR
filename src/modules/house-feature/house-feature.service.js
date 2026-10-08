import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

const { HouseFeature } = db;

export async function createHouseFeatureService(data, userId) {
  return await db.sequelize.transaction(async (transaction) => {
    const newFeature = await HouseFeature.create(
      {
        company_id: data.company_id || null,
        builder_id: data.builder_id || null,
        name: data.name,
        description: data.description || null,
        created_by: userId,
        updated_by: userId,
      },
      { transaction }
    );
    return newFeature;
  });
}

export async function getAllHouseFeaturesService(queryParams, companyId, builderId) {
  const { page = 1, limit = 25, company_id: queryCompanyId, builder_id: queryBuilderId, search } = queryParams;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = {
    [Op.and]: [
      {
        [Op.or]: [
          { company_id: companyId || null },
          { builder_id: builderId }
        ].filter(cond => {
          // If companyId is falsy, we only want builder_id in the OR condition
          // The raw SQL did: `(company_id = $x OR builder_id = $y)`, checking companyId || null
          return cond.company_id !== undefined || cond.builder_id !== undefined;
        })
      }
    ]
  };

  if (queryCompanyId) {
    whereConditions[Op.and].push({ company_id: queryCompanyId });
  }

  if (queryBuilderId) {
    whereConditions[Op.and].push({ builder_id: queryBuilderId });
  }

  if (search) {
    whereConditions[Op.and].push({
      [Op.or]: [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ]
    });
  }

  const { count, rows } = await HouseFeature.findAndCountAll({
    where: whereConditions,
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset,
  });

  return {
    rows,
    count,
    page: pageNum,
    limit: limitNum,
  };
}

export async function getHouseFeatureByIdService(houseFeatureId, companyId, builderId) {
  const feature = await HouseFeature.findOne({
    where: {
      house_feature_id: houseFeatureId,
      [Op.or]: [
        { company_id: companyId || null },
        { builder_id: builderId }
      ]
    }
  });

  if (!feature) {
    const error = new Error("House feature not found");
    error.statusCode = 404;
    throw error;
  }

  return feature;
}

export async function updateHouseFeatureService(houseFeatureId, data, userId, companyId, builderId) {
  return await db.sequelize.transaction(async (transaction) => {
    const feature = await HouseFeature.findOne({
      where: {
        house_feature_id: houseFeatureId,
        [Op.or]: [
          { company_id: companyId || null },
          { builder_id: builderId }
        ]
      },
      transaction,
    });

    if (!feature) {
      const error = new Error("House feature not found");
      error.statusCode = 404;
      throw error;
    }

    const allowedFields = ["name", "description", "company_id", "builder_id"];
    let hasUpdates = false;

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        feature[field] = data[field];
        hasUpdates = true;
      }
    }

    if (!hasUpdates) {
      const error = new Error("No valid fields to update");
      error.statusCode = 400;
      throw error;
    }

    feature.updated_by = userId;
    await feature.save({ transaction });

    return feature;
  });
}

export async function deleteHouseFeatureService(houseFeatureId, companyId, builderId) {
  return await db.sequelize.transaction(async (transaction) => {
    const feature = await HouseFeature.findOne({
      where: {
        house_feature_id: houseFeatureId,
        [Op.or]: [
          { company_id: companyId || null },
          { builder_id: builderId }
        ]
      },
      transaction,
    });

    if (!feature) {
      const error = new Error("House feature not found");
      error.statusCode = 404;
      throw error;
    }

    await feature.destroy({ transaction });
    return true;
  });
}
