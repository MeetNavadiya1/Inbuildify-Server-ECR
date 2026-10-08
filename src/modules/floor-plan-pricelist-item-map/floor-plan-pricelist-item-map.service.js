import db from "../../config/database/models/postgre-models/index.js";

export async function getAllFloorPlanPricelistItemMapsService({
  builder_id,
  company_id,
  page = 1,
  limit = 25,
  floor_plan_id,
  price_list_item_id,
  include_default,
  modify,
}) {
  const pageValue = parseInt(page, 10);
  const limitValue = parseInt(limit, 10);
  const offsetValue = (pageValue - 1) * limitValue;

  const { Op } = db.Sequelize;

  const where = {};

  if (floor_plan_id) {
    where.floor_plan_id = floor_plan_id;
  }

  if (price_list_item_id) {
    where.price_list_item_id = price_list_item_id;
  }

  if (include_default !== undefined) {
    where.include_default = include_default === "true";
  }

  if (modify !== undefined) {
    where.modify = modify === "true";
  }

  const { count, rows } = await db.FloorPlanPricelistItemMap.findAndCountAll({
    where,
    include: [
      {
        model: db.FloorPlan,
        as: "floorPlan",
        attributes: ["builder_id", "company_id"],
        required: true,
        where: {
          [Op.or]: [
            { builder_id },
            { company_id },
          ],
        },
      },
      {
        model: db.PriceListItem,
        as: "priceListItem",
        attributes: ["item_description", "short_description", "cost_type"],
        required: false,
        include: [{ model: db.PriceList, as: "priceList", attributes: ["price_list_id", "name"] }],
      },
    ],
    order: [["created_at", "DESC"]],
    limit: limitValue,
    offset: offsetValue,
  });

  const totalPages = Math.ceil(count / limitValue);

  const mappings = rows.map((row) => {
    const plain = row.toJSON();
    return {
      ...plain,
      item_description: plain.priceListItem?.item_description ?? null,
      short_description: plain.priceListItem?.short_description ?? null,
      cost_type: plain.priceListItem?.cost_type ?? null,
      price_list: plain.priceListItem?.priceList
        ? {
          id: plain.priceListItem.priceList.price_list_id,
          name: plain.priceListItem.priceList.name,
        }
        : null,
    };
  });

  return {
    mappings,
    pagination: {
      currentPage: pageValue,
      totalPages,
      totalRecords: count,
      limit: limitValue,
    },
  };
}

export async function createFloorPlanPricelistItemMapService({
  floor_plan_id,
  price_list_item_id,
  include_default,
  modify,
  quantity,
  builderId,
  companyId,
}) {
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const floorPlan = await db.FloorPlan.findOne({
      where: {
        floor_plan_id,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      attributes: ["floor_plan_id"],
      transaction,
    });

    if (!floorPlan) {
      const error = new Error("Invalid floor_plan_id or access denied");
      error.statusCode = 400;
      throw error;
    }

    const priceListItem = await db.PriceListItem.findOne({
      where: {
        price_list_item_id,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      attributes: ["price_list_item_id", "cost_type"],
      transaction,
    });

    if (!priceListItem) {
      const error = new Error("Invalid price_list_item_id or access denied");
      error.statusCode = 400;
      throw error;
    }

    if (
      (priceListItem.cost_type === "Fixed" || priceListItem.cost_type === "Included") &&
      quantity !== undefined &&
      quantity !== null &&
      quantity !== ""
    ) {
      const error = new Error("Quantity cannot be set for price list items with fixed or included cost type");
      error.statusCode = 400;
      throw error;
    }

    if (
      priceListItem.cost_type === "Variable" &&
      (quantity === undefined || quantity === null || quantity === "")
    ) {
      const error = new Error("Quantity is required for price list items with variable cost type");
      error.statusCode = 400;
      throw error;
    }

    const newMapping = await db.FloorPlanPricelistItemMap.create(
      {
        floor_plan_id,
        price_list_item_id,
        include_default: include_default !== undefined ? include_default : false,
        modify: modify !== undefined ? modify : false,
        quantity: quantity !== undefined ? quantity : null,
      },
      { transaction },
    );

    await transaction.commit();
    return newMapping;
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    if (error.name === "SequelizeUniqueConstraintError") {
      const customError = new Error("This price list item is already mapped to the floor plan.");
      customError.statusCode = 409;
      throw customError;
    }
    throw error;
  }
}

export async function deleteFloorPlanPricelistItemMapService({ id, builderId, companyId }) {
  const transaction = await db.sequelize.transaction();
  
  try {
    const mapping = await db.FloorPlanPricelistItemMap.findOne({
      where: { id },
      include: [
        {
          model: db.FloorPlan,
          as: "floorPlan",
          attributes: ["builder_id", "company_id"],
        },
      ],
      transaction,
    });

    if (!mapping) {
      const error = new Error("Floor plan price list item map not found.");
      error.statusCode = 404;
      throw error;
    }

    if (
      mapping.floorPlan.builder_id !== builderId &&
      mapping.floorPlan.company_id !== companyId
    ) {
      const error = new Error("Access denied - you can only delete your own records.");
      error.statusCode = 403;
      throw error;
    }

    await mapping.destroy({ transaction });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * FETCH MAPPING BY ID WITH SCOPING
 */
export async function getFloorPlanPricelistItemMapByIdService({ id, builderId, companyId }) {
  const { Op } = db.Sequelize;

  const mapping = await db.FloorPlanPricelistItemMap.findOne({
    where: { id },
    include: [
      {
        model: db.FloorPlan,
        as: "floorPlan",
        attributes: ["builder_id", "company_id"],
        required: true,
        where: {
          [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
        },
      },
    ],
  });

  if (!mapping) {
    const error = new Error("Floor plan price list item map not found or access denied.");
    error.statusCode = 404;
    throw error;
  }

  return mapping.get({ plain: true });
}

/**
 * UPDATE MAPPING WITH SCOPING AND VALIDATION
 */
export async function updateFloorPlanPricelistItemMapService({ id, builderId, companyId, payload }) {
  const transaction = await db.sequelize.transaction();
  const { include_default, modify, quantity } = payload;

  try {
    const mapping = await db.FloorPlanPricelistItemMap.findOne({
      where: { id },
      include: [
        {
          model: db.FloorPlan,
          as: "floorPlan",
          attributes: ["builder_id", "company_id"],
        },
      ],
      transaction,
    });

    if (!mapping) {
      const error = new Error("Floor plan price list item map not found.");
      error.statusCode = 404;
      throw error;
    }

    if (
      mapping.floorPlan.builder_id !== builderId &&
      mapping.floorPlan.company_id !== companyId
    ) {
      const error = new Error("Access denied - you can only update your own records.");
      error.statusCode = 403;
      throw error;
    }

    const updateData = {};
    if (include_default !== undefined) updateData.include_default = include_default;
    if (modify !== undefined) updateData.modify = modify;
    if (quantity !== undefined) updateData.quantity = quantity;

    if (Object.keys(updateData).length === 0) {
      const error = new Error("At least one field is required for update.");
      error.statusCode = 400;
      throw error;
    }

    await mapping.update(updateData, { transaction });
    await transaction.commit();

    return await getFloorPlanPricelistItemMapByIdService({ id, builderId, companyId });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}
