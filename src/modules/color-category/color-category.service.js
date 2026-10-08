import db from "../../config/database/models/postgre-models/index.js";
import { resolveByColorId, resolveByCategoryId, jobSet, templateSet } from "../color/color-table-router.js";
import { ensureJobColorsCloned } from "../color/color.service.js";

/**
 * Creates a new color category with sort rebalancing and validation.
 */
export const createColorCategoryService = async (userData, bodyData) => {
  const { Supplier, ColorGroup } = db;
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;
    const userId = userData?.users_id;

    const {
      color_id,
      category_name,
      selection_type,
      sort_order,
      status,
      suppliers,
      color_group,
    } = bodyData;

    if (!color_id) {
      throw { status: 400, message: "Color ID is required." };
    }
    if (!category_name || category_name.trim() === "") {
      throw { status: 400, message: "Category name is required." };
    }

    const { Color, ColorCategory, isJob } = await resolveByColorId(color_id);

    // 1. Verify Color ownership and status
    const color = await Color.findOne({
      where: {
        color_id,
        builder_id: builderId,
        company_id: companyId,
        status: true,
      },
      transaction,
    });

    if (!color) {
      throw { status: 400, message: "Invalid color ID or color not found or inactive.." };
    }

    // 2. Resolve and validate sort_order
    const maxSortOrder = (await ColorCategory.max("sort_order", {
      where: { color_id },
      transaction,
    })) || 0;

    let finalSortOrder = sort_order;

    if (finalSortOrder == null) {
      finalSortOrder = maxSortOrder + 1;
    }

    if (finalSortOrder < 1 || finalSortOrder > maxSortOrder + 1) {
      throw {
        status: 400,
        message: `Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`,
      };
    }

    // 3. Shift existing categories to make room
    if (finalSortOrder <= maxSortOrder) {
      await ColorCategory.increment(
        { sort_order: 1 },
        {
          where: {
            color_id,
            sort_order: { [Op.gte]: finalSortOrder },
          },
          transaction,
        },
      );
    }

    // 3. Duplicate Check
    const duplicate = await ColorCategory.findOne({
      where: {
        color_id,
        [Op.and]: [
          db.sequelize.where(
            db.sequelize.fn("LOWER", db.sequelize.col("category_name")),
            Op.eq,
            category_name.trim().toLowerCase(),
          ),
        ],
      },
      transaction,
    });

    if (duplicate) {
      throw { status: 409, message: "Category with this name already exists for this color." };
    }

    // 4. Validate Suppliers
    if (suppliers && suppliers.length > 0) {
      const supplierCount = await Supplier.count({
        where: {
          supplier_id: { [Op.in]: suppliers },
          company_id: companyId,
          builder_id: builderId,
          status: true,
        },
        transaction,
      });

      if (supplierCount !== suppliers.length) {
        throw { status: 400, message: "One or more supplier IDs are invalid or not in your scope." };
      }
    }

    // 5. Validate Color Groups
    if (color_group && color_group.length > 0) {
      const groupCount = await ColorGroup.count({
        where: {
          color_group_id: { [Op.in]: color_group },
          company_id: companyId,
          builder_id: builderId,
          status: true,
        },
        transaction,
      });

      if (groupCount !== color_group.length) {
        throw { status: 400, message: "One or more color group IDs are invalid or not in your scope." };
      }
    }

    const scope = isJob ? { job_id: color.job_id } : {};

    // 6. Create Category
    const newCategory = await ColorCategory.create(
      {
        color_id,
        category_name: category_name.trim(),
        selection_type: selection_type || "multiple",
        sort_order: finalSortOrder,
        status: status !== undefined ? status : true,
        suppliers: suppliers || [],
        color_group: color_group || [],
        created_by: userId,
        updated_by: userId,
        ...scope,
      },
      { transaction },
    );

    await transaction.commit();
    return newCategory.get({ plain: true });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Fetches paginated color categories.
 */
export const getColorCategoriesService = async (userData, queryData) => {
  const builderId = userData?.builder_id;
  const companyId = userData?.company_id;
  const { color_id, page = 1, limit = 10 } = queryData;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Make sure the job's colors have been cloned before reading them, so a read
  // that races ahead of the /colors call doesn't see an empty job table.
  await ensureJobColorsCloned(queryData.job_id, builderId, companyId);

  const isJob = queryData.job_id ? true : (color_id ? (await resolveByColorId(color_id)).isJob : false);
  const { ColorCategory, Color } = isJob ? jobSet() : templateSet();

  const tableName = isJob ? "job_color" : "color";
  const subQuery = `(SELECT color_id FROM ${tableName} WHERE builder_id = '${builderId}' AND company_id = '${companyId}'${queryData.job_id ? ` AND job_id = '${queryData.job_id}'` : ""})`;

  const whereClause = {
    color_id: color_id || {
      [db.Sequelize.Op.in]: db.sequelize.literal(subQuery),
    },
  };

  if (queryData.job_id) {
    whereClause.job_id = queryData.job_id;
  }

  const { count, rows } = await ColorCategory.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: Color,
        as: "color",
        attributes: ["color_name"],
        required: true,
      },
    ],
    order: [
      ["sort_order", "ASC"],
      ["createdAt", "DESC"],
    ],
    limit: parseInt(limit),
    offset,
  });

  const categories = rows.map((r) => {
    const data = r.get({ plain: true });
    data.colorName = data.color?.color_name;
    delete data.color;
    return data;
  });

  return {
    colorCategories: categories,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
      total: count,
      limit: parseInt(limit),
    },
  };
};

/**
 * Fetches a single color category by ID.
 */
export const getColorCategoryByIdService = async (userData, categoryId) => {
  const { ColorCategory, Color } = await resolveByCategoryId(categoryId);
  const builderId = userData?.builder_id;
  const companyId = userData?.company_id;

  const category = await ColorCategory.findOne({
    where: { color_category_id: categoryId },
    include: [
      {
        model: Color,
        as: "color",
        where: { builder_id: builderId, company_id: companyId },
        attributes: ["color_name"],
        required: true,
      },
    ],
  });

  if (!category) {
    throw { status: 404, message: "Color category not found." };
  }

  const data = category.get({ plain: true });
  data.colorName = data.color?.color_name;
  delete data.color;
  return data;
};

/**
 * Updates a color category with sort shifting.
 */
export const updateColorCategoryService = async (userData, categoryId, bodyData) => {
  const { ColorCategory, Color } = await resolveByCategoryId(categoryId);
  const { Supplier, ColorGroup } = db;
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;
    const userId = userData?.users_id;

    const {
      category_name,
      selection_type,
      sort_order,
      status,
      suppliers,
      color_group,
    } = bodyData;

    // 1. Verify existence and ownership
    const existingCategory = await ColorCategory.findOne({
      where: { color_category_id: categoryId },
      include: [
        {
          model: Color,
          as: "color",
          where: { builder_id: builderId, company_id: companyId },
          required: true,
        },
      ],
      transaction,
    });

    if (!existingCategory) {
      throw { status: 404, message: "Color category not found." };
    }

    // 2. Sort Shift
    if (sort_order !== undefined && sort_order !== existingCategory.sort_order) {
      if (sort_order > existingCategory.sort_order) {
        await ColorCategory.decrement(
          { sort_order: 1 },
          {
            where: {
              color_id: existingCategory.color_id,
              sort_order: { [Op.gt]: existingCategory.sort_order, [Op.lte]: sort_order },
              color_category_id: { [Op.ne]: categoryId },
            },
            transaction,
          },
        );
      } else {
        await ColorCategory.increment(
          { sort_order: 1 },
          {
            where: {
              color_id: existingCategory.color_id,
              sort_order: { [Op.gte]: sort_order, [Op.lt]: existingCategory.sort_order },
              color_category_id: { [Op.ne]: categoryId },
            },
            transaction,
          },
        );
      }
    }

    // 3. Validation
    if (suppliers && suppliers.length > 0) {
      const supplierCount = await Supplier.count({
        where: {
          supplier_id: { [Op.in]: suppliers },
          company_id: companyId,
          builder_id: builderId,
        },
        transaction,
      });
      if (supplierCount !== suppliers.length) {
        throw { status: 400, message: "One or more supplier IDs are invalid or not in your scope." };
      }
    }

    if (color_group && color_group.length > 0) {
      const groupCount = await ColorGroup.count({
        where: {
          color_group_id: { [Op.in]: color_group },
          company_id: companyId,
          builder_id: builderId,
          status: true,
        },
        transaction,
      });
      if (groupCount !== color_group.length) {
        throw { status: 400, message: "One or more color group IDs are invalid or not in your scope." };
      }
    }

    // 4. Update
    const updateData = {};
    if (category_name !== undefined) {
      updateData.category_name = category_name;
    }
    if (selection_type !== undefined) {
      updateData.selection_type = selection_type;
    }
    if (sort_order !== undefined) {
      updateData.sort_order = sort_order;
    }
    if (status !== undefined) {
      updateData.status = status;
    }
    if (suppliers !== undefined) {
      updateData.suppliers = suppliers;
    }
    if (color_group !== undefined) {
      updateData.color_group = color_group;
    }
    updateData.updated_by = userId;
    updateData.updatedAt = new Date();

    if (Object.keys(updateData).length <= 1) {
      throw { status: 400, message: "At least one field must be provided for update." };
    }

    await existingCategory.update(updateData, { transaction });

    await transaction.commit();
    return existingCategory.get({ plain: true });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Fetches all categories for a given color ID.
 */
export const getColorCategoriesByColorIdService = async (userData, colorId) => {
  const { ColorCategory, Color } = await resolveByColorId(colorId);
  const builderId = userData?.builder_id;
  const companyId = userData?.company_id;

  const categories = await ColorCategory.findAll({
    where: { color_id: colorId },
    include: [
      {
        model: Color,
        as: "color",
        where: { builder_id: builderId, company_id: companyId },
        attributes: ["color_name"],
        required: true,
      },
    ],
    order: [
      ["sort_order", "ASC"],
      ["createdAt", "DESC"],
    ],
  });

  return categories.map((cat) => {
    const data = cat.get({ plain: true });
    data.colorName = data.color?.color_name;
    delete data.color;
    return data;
  });
};

/**
 * Deletes a color category and rebalances sort orders.
 */
export const deleteColorCategoryService = async (userData, categoryId) => {
  const { ColorCategory, Color } = await resolveByCategoryId(categoryId);
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;

    const existingCategory = await ColorCategory.findOne({
      where: { color_category_id: categoryId },
      include: [
        {
          model: Color,
          as: "color",
          where: { builder_id: builderId, company_id: companyId },
          required: true,
        },
      ],
      transaction,
    });

    if (!existingCategory) {
      throw { status: 404, message: "Color category not found." };
    }

    // Shift orders
    await ColorCategory.decrement(
      { sort_order: 1 },
      {
        where: {
          color_id: existingCategory.color_id,
          sort_order: { [db.Sequelize.Op.gt]: existingCategory.sort_order },
        },
        transaction,
      },
    );

    await existingCategory.destroy({ transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Deep clones a color category and its items/fields.
 */
export const copyColorCategoryService = async (userData, sourceCategoryId, bodyData) => {
  const sourceSet = await resolveByCategoryId(sourceCategoryId);
  const { color_id, category_name, sort_order } = bodyData;

  if (!color_id) {
    throw { status: 400, message: "Target color ID is required." };
  }
  if (!category_name || category_name.trim() === "") {
    throw { status: 400, message: "Category name is required." };
  }

  const targetSet = await resolveByColorId(color_id);

  const ColorCategorySource = sourceSet.ColorCategory;
  const ColorSource = sourceSet.Color;
  const ColorItemSource = sourceSet.ColorItem;
  const ColorItemCustomFieldSource = sourceSet.ColorItemCustomField;

  const ColorCategoryTarget = targetSet.ColorCategory;
  const ColorTarget = targetSet.Color;
  const ColorItemTarget = targetSet.ColorItem;
  const ColorItemCustomFieldTarget = targetSet.ColorItemCustomField;

  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;
    const userId = userData?.users_id;

    // 1. Check source
    const sourceCategory = await ColorCategorySource.findOne({
      where: { color_category_id: sourceCategoryId, status: true },
      include: [{
        model: ColorSource,
        as: "color",
        where: { [Op.or]: [{ builder_id: builderId }, { company_id: companyId }], status: true },
        required: true,
      }],
      transaction,
    });

    if (!sourceCategory) {
      throw { status: 404, message: "Source category not found or inactive." };
    }

    // 2. Check target color
    const targetColor = await ColorTarget.findOne({
      where: { color_id, builder_id: builderId, company_id: companyId, status: true },
      transaction,
    });

    if (!targetColor) {
      throw { status: 404, message: "Target color not found or inactive." };
    }

    const categoryCount = await ColorCategoryTarget.count({ where: { color_id }, transaction });
    const maxAllowedSortOrder = categoryCount + 1;

    if (sort_order && sort_order > maxAllowedSortOrder) {
      throw {
        status: 400,
        message: `Sort order cannot be more than ${maxAllowedSortOrder}. Current total categories: ${categoryCount}`,
      };
    }

    const finalSortOrder = sort_order || maxAllowedSortOrder;

    // 3. Duplicate check
    const duplicate = await ColorCategoryTarget.findOne({
      where: {
        color_id,
        [Op.and]: [db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("category_name")), Op.eq, category_name.trim().toLowerCase())],
      },
      transaction,
    });

    if (duplicate) {
      throw { status: 409, message: "Category with this name already exists in this color." };
    }

    // 4. Shift target sort orders
    await ColorCategoryTarget.increment({ sort_order: 1 }, {
      where: { color_id, sort_order: { [Op.gte]: finalSortOrder } },
      transaction,
    });

    // 5. Create new category
    const categoryData = sourceCategory.get({ plain: true });
    delete categoryData.color_category_id;
    categoryData.color_id = color_id;
    categoryData.category_name = category_name.trim();
    categoryData.sort_order = finalSortOrder;
    categoryData.created_by = userId;
    categoryData.updated_by = userId;
    categoryData.createdAt = new Date();
    categoryData.updatedAt = new Date();
    if (targetSet.isJob) {
      categoryData.job_id = targetColor.job_id;
    }

    const newCategory = await ColorCategoryTarget.create(categoryData, { transaction });
    const newCategoryId = newCategory.color_category_id;

    // 6. Deep clone Items
    const items = await ColorItemSource.findAll({ where: { color_category_id: sourceCategoryId }, transaction });

    for (const item of items) {
      const itemData = item.get({ plain: true });
      const oldItemId = itemData.color_item_id;
      delete itemData.color_item_id;
      itemData.color_category_id = newCategoryId;
      itemData.color_id = color_id;
      itemData.company_id = companyId;
      itemData.builder_id = builderId;
      itemData.createdAt = new Date();
      itemData.updatedAt = new Date();
      if (targetSet.isJob) {
        itemData.job_id = targetColor.job_id;
      }

      const newItem = await ColorItemTarget.create(itemData, { transaction });
      const newColorItemId = newItem.color_item_id;

      // 7. Deep clone Custom Fields
      const customFields = await ColorItemCustomFieldSource.findAll({
        where: { color_item: oldItemId },
        order: [["sort_order", "ASC"]],
        transaction,
      });

      for (const field of customFields) {
        const fieldData = field.get({ plain: true });
        delete fieldData.color_item_custom_field_id;
        fieldData.color_item = newColorItemId;
        fieldData.createdAt = new Date();
        fieldData.updatedAt = new Date();
        if (targetSet.isJob) {
          fieldData.job_id = targetColor.job_id;
        }
        await ColorItemCustomFieldTarget.create(fieldData, { transaction });
      }
    }

    await transaction.commit();
    return newCategory.get({ plain: true });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};
