import db from "../../config/database/models/postgre-models/index.js";

/**
 * Creates a new color group item mapping with ownership validation and duplicate check.
 * @param {Object} userData - req.user data
 * @param {Object} mapData - req.body data
 */
export const createColorGroupItemMapService = async (userData, mapData) => {
  const { ColorGroupItemMap, ColorGroup, ColorItem } = db;
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;

    if (!builderId || !companyId) {
      throw { status: 401, message: "Unauthorized." };
    }

    const { color_group_id, color_item_id } = mapData;

    if (!color_group_id || !color_item_id) {
      throw { status: 400, message: "Color group ID and color item ID are required." };
    }

    // 1. Validate Color Group ownership
    const colorGroup = await ColorGroup.findOne({
      where: {
        color_group_id,
        [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
      },
      transaction,
    });

    if (!colorGroup) {
      throw { status: 404, message: "Color group not found or does not belong to your organization." };
    }

    // 2. Validate Color Item ownership
    const colorItem = await ColorItem.findOne({
      where: {
        color_item_id,
        [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
      },
      transaction,
    });

    if (!colorItem) {
      throw { status: 404, message: "Color item not found or does not belong to your organization." };
    }

    // 3. Duplicate check
    const duplicate = await ColorGroupItemMap.findOne({
      where: { color_group_id, color_item_id },
      transaction,
    });

    if (duplicate) {
      throw { status: 409, message: "This color item is already mapped to this color group." };
    }

    // 4. Create the mapping
    const newMapping = await ColorGroupItemMap.create(
      { color_group_id, color_item_id },
      { transaction },
    );

    await transaction.commit();
    return newMapping.get({ plain: true });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Fetches all color group item mappings with pagination, scoped to the user's company/builder.
 * @param {Object} userData - req.user data
 * @param {Object} queryData - req.query data
 */
export const getAllColorGroupItemMapsService = async (userData, queryData) => {
  const { ColorGroupItemMap, ColorGroup, ColorItem } = db;
  const { Op } = db.Sequelize;

  const builderId = userData?.builder_id;
  const companyId = userData?.company_id;

  if (!builderId || !companyId) {
    throw { status: 401, message: "Unauthorized." };
  }

  const page = parseInt(queryData.page) || 1;
  const limit = parseInt(queryData.limit) || 25;
  const offset = (page - 1) * limit;
  const { color_group_id, color_item_id } = queryData;

  // Build where clause for the mapping table
  const whereClause = {};
  if (color_group_id) {
    whereClause.color_group_id = color_group_id;
  }
  if (color_item_id) {
    whereClause.color_item_id = color_item_id;
  }

  const scopeFilter = {
    [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
  };

  const { count, rows } = await ColorGroupItemMap.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: ColorGroup,
        as: "colorGroup",
        attributes: [],
        where: scopeFilter,
        required: true,
      },
      {
        model: ColorItem,
        as: "colorItem",
        attributes: [],
        where: scopeFilter,
        required: true,
      },
    ],
    attributes: ["id", "color_group_id", "color_item_id", "created_at", "updated_at"],
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  const totalPages = Math.ceil(count / limit);

  return {
    mappings: rows.map((r) => r.get({ plain: true })),
    pagination: {
      totalRecords: count,
      currentPage: page,
      totalPages,
      limit,
    },
  };
};

/**
 * Deletes a color group item mapping with ownership validation.
 * @param {Object} userData - req.user data
 * @param {string} mappingId - the mapping ID
 */
export const deleteColorGroupItemMapService = async (userData, mappingId) => {
  const { ColorGroupItemMap, ColorGroup, ColorItem } = db;
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;

    if (!builderId || !companyId) {
      throw { status: 401, message: "Unauthorized." };
    }

    const scopeFilter = {
      [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    };

    // 1. Find existing mapping with ownership check
    const existing = await ColorGroupItemMap.findOne({
      where: { id: mappingId },
      include: [
        {
          model: ColorGroup,
          as: "colorGroup",
          attributes: [],
          where: scopeFilter,
          required: true,
        },
        {
          model: ColorItem,
          as: "colorItem",
          attributes: [],
          where: scopeFilter,
          required: true,
        },
      ],
      transaction,
    });

    if (!existing) {
      throw { status: 404, message: "Color group item mapping not found or does not belong to your organization." };
    }

    // 2. Delete the mapping
    await existing.destroy({ transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default {
  createColorGroupItemMapService,
  getAllColorGroupItemMapsService,
  deleteColorGroupItemMapService,
};
