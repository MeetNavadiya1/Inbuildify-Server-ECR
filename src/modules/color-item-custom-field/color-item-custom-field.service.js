import db from "../../config/database/models/postgre-models/index.js";

/**
 * Creates a new color item custom field with sort order shifting and duplicate check.
 * @param {Object} userData - req.user data
 * @param {Object} fieldData - req.body data
 */
export const createColorItemCustomFieldService = async (userData, fieldData) => {
  const { ColorItemCustomField, ColorItem } = db;
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;

    if (!builderId || !companyId) {
      throw { status: 401, message: "Unauthorized." };
    }

    const { color_item, field_type, field_name, required_field, sort_order } = fieldData;

    if (!color_item) {
      throw { status: 400, message: "Color Item ID is required." };
    }

    if (!field_name || field_name.trim() === "") {
      throw { status: 400, message: "Field name is required." };
    }

    const finalSortOrder = sort_order || 1;

    // 1. Validate color item ownership
    const colorItemExists = await ColorItem.findOne({
      where: {
        color_item_id: color_item,
        [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
      },
      transaction,
    });

    if (!colorItemExists) {
      throw { status: 400, message: "Invalid color item ID or color item not found in your scope." };
    }

    // 2. Shift existing sort orders
    await ColorItemCustomField.increment(
      { sort_order: 1 },
      {
        where: {
          color_item,
          sort_order: { [Op.gte]: finalSortOrder },
        },
        transaction,
      },
    );

    // 3. Duplicate check (case-insensitive)
    const duplicate = await ColorItemCustomField.findOne({
      where: {
        color_item,
        [Op.and]: [
          db.sequelize.where(
            db.sequelize.fn("LOWER", db.sequelize.col("field_name")),
            Op.eq,
            field_name.trim().toLowerCase(),
          ),
        ],
      },
      transaction,
    });

    if (duplicate) {
      throw { status: 409, message: "Field with this name already exists for this color item." };
    }

    // 4. Create the custom field
    const newField = await ColorItemCustomField.create(
      {
        color_item,
        field_type,
        field_name: field_name.trim(),
        required_field: required_field !== undefined ? required_field : false,
        sort_order: finalSortOrder,
      },
      { transaction },
    );

    await transaction.commit();
    return newField.get({ plain: true });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Fetches color item custom fields with pagination, scoped to the user's company/builder.
 * @param {Object} userData - req.user data
 * @param {Object} queryData - req.query data
 */
export const getColorItemCustomFieldsService = async (userData, queryData) => {
  const { ColorItemCustomField, ColorItem } = db;
  const { Op } = db.Sequelize;

  const builderId = userData?.builder_id;
  const companyId = userData?.company_id;

  if (!builderId || !companyId) {
    throw { status: 401, message: "Unauthorized." };
  }

  const page = parseInt(queryData.page) || 1;
  const limit = parseInt(queryData.limit) || 10;
  const offset = (page - 1) * limit;
  const { color_item } = queryData;

  // Build where clause
  const whereClause = {};
  if (color_item) {
    whereClause.color_item = color_item;
  }

  const { count, rows } = await ColorItemCustomField.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: ColorItem,
        as: "colorItem",
        attributes: ["item_name"],
        where: {
          [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
        },
        required: true,
      },
    ],
    order: [
      ["sort_order", "ASC"],
      ["created_at", "DESC"],
    ],
    limit,
    offset,
  });

  const totalPages = Math.ceil(count / limit);

  // Format rows to include color_item_name at top level
  const colorItemCustomFields = rows.map((r) => {
    const plain = r.get({ plain: true });
    return {
      ...plain,
      color_item_name: plain.colorItem?.item_name || null,
      colorItem: undefined,
    };
  });

  return {
    colorItemCustomFields,
    pagination: {
      currentPage: page,
      totalPages,
      total: count,
      limit,
    },
  };
};

/**
 * Fetches a single color item custom field by ID, scoped to the user's company/builder.
 * @param {Object} userData - req.user data
 * @param {string} fieldId - the custom field ID
 */
export const getColorItemCustomFieldByIdService = async (userData, fieldId) => {
  const { ColorItemCustomField, ColorItem } = db;
  const { Op } = db.Sequelize;

  const builderId = userData?.builder_id;
  const companyId = userData?.company_id;

  if (!builderId || !companyId) {
    throw { status: 401, message: "Unauthorized." };
  }

  const field = await ColorItemCustomField.findOne({
    where: { color_item_custom_field_id: fieldId },
    include: [
      {
        model: ColorItem,
        as: "colorItem",
        attributes: ["item_name"],
        where: {
          [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
        },
        required: true,
      },
    ],
  });

  if (!field) {
    throw { status: 404, message: "Color item custom field not found." };
  }

  const plain = field.get({ plain: true });
  return {
    ...plain,
    color_item_name: plain.colorItem?.item_name || null,
    colorItem: undefined,
  };
};

/**
 * Updates an existing color item custom field with sort order re-balancing.
 * @param {Object} userData - req.user data
 * @param {string} fieldId - the custom field ID
 * @param {Object} fieldData - req.body data
 */
export const updateColorItemCustomFieldService = async (userData, fieldId, fieldData) => {
  const { ColorItemCustomField, ColorItem } = db;
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;

    if (!builderId || !companyId) {
      throw { status: 401, message: "Unauthorized." };
    }

    const { color_item, field_type, field_name, required_field, sort_order } = fieldData;

    // 1. Find existing field with ownership check via ColorItem join
    const existingField = await ColorItemCustomField.findOne({
      where: { color_item_custom_field_id: fieldId },
      include: [
        {
          model: ColorItem,
          as: "colorItem",
          attributes: ["company_id", "builder_id"],
          where: {
            [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
          },
          required: true,
        },
      ],
      transaction,
    });

    if (!existingField) {
      throw { status: 404, message: "Color item custom field not found." };
    }

    // 2. Sort order re-balancing
    if (sort_order !== undefined && sort_order !== existingField.sort_order) {
      if (sort_order > existingField.sort_order) {
        // Moving down: decrement fields in between
        await ColorItemCustomField.decrement(
          { sort_order: 1 },
          {
            where: {
              color_item: existingField.color_item,
              sort_order: {
                [Op.gt]: existingField.sort_order,
                [Op.lte]: sort_order,
              },
              color_item_custom_field_id: { [Op.ne]: fieldId },
            },
            transaction,
          },
        );
      } else {
        // Moving up: increment fields in between
        await ColorItemCustomField.increment(
          { sort_order: 1 },
          {
            where: {
              color_item: existingField.color_item,
              sort_order: {
                [Op.gte]: sort_order,
                [Op.lt]: existingField.sort_order,
              },
              color_item_custom_field_id: { [Op.ne]: fieldId },
            },
            transaction,
          },
        );
      }
    }

    // 3. Prepare update data
    const updateData = {};
    if (color_item !== undefined) {
      updateData.color_item = color_item;
    }
    if (field_type !== undefined) {
      updateData.field_type = field_type;
    }
    if (field_name !== undefined) {
      updateData.field_name = field_name;
    }
    if (required_field !== undefined) {
      updateData.required_field = required_field;
    }
    if (sort_order !== undefined) {
      updateData.sort_order = sort_order;
    }

    if (Object.keys(updateData).length === 0) {
      throw { status: 400, message: "At least one field must be provided for update." };
    }

    // 4. Perform update
    await existingField.update(updateData, { transaction });

    await transaction.commit();
    return existingField.get({ plain: true });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Deletes a color item custom field and re-balances sort orders.
 * @param {Object} userData - req.user data
 * @param {string} fieldId - the custom field ID
 */
export const deleteColorItemCustomFieldService = async (userData, fieldId) => {
  const { ColorItemCustomField, ColorItem } = db;
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;

    if (!builderId || !companyId) {
      throw { status: 401, message: "Unauthorized." };
    }

    // 1. Find existing field with ownership check
    const existingField = await ColorItemCustomField.findOne({
      where: { color_item_custom_field_id: fieldId },
      include: [
        {
          model: ColorItem,
          as: "colorItem",
          attributes: ["company_id", "builder_id"],
          where: {
            [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
          },
          required: true,
        },
      ],
      transaction,
    });

    if (!existingField) {
      throw { status: 404, message: "Color item custom field not found." };
    }

    // 2. Shift sort orders (decrement all fields after this one)
    await ColorItemCustomField.decrement(
      { sort_order: 1 },
      {
        where: {
          color_item: existingField.color_item,
          sort_order: { [Op.gt]: existingField.sort_order },
        },
        transaction,
      },
    );

    // 3. Delete the field
    await existingField.destroy({ transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default {
  createColorItemCustomFieldService,
  getColorItemCustomFieldsService,
  getColorItemCustomFieldByIdService,
  updateColorItemCustomFieldService,
  deleteColorItemCustomFieldService,
};
