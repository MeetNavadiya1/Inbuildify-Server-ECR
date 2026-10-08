import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { resolveByCategoryId, resolveBySubCategoryId, jobSet, templateSet } from "../color/color-table-router.js";

const { Op } = db.Sequelize;

/**
 * Format a user object to match the original response format.
 */
const formatUser = (user) => {
  if (!user) return null;
  return {
    id: user.users_id,
    name: user.name || null,
  };
};

/**
 * Transforms a Sequelize row into the expected response format.
 */
const transformRow = (row) => {
  const plain = row.get({ plain: true });
  const formatted = keysToCamelCase(plain);
  
  return {
    ...formatted,
    createdBy: formatUser(plain.createdByUser),
    updatedBy: formatUser(plain.updatedByUser),
  };
};

/**
 * Get all color sub-categories with pagination and filtering.
 */
export const getAllColorSubCategoriesService = async (userData, colorCategoryId, limit, offset) => {
  const { ColorSubCategory, ColorCategory } = await resolveByCategoryId(colorCategoryId);
  const { Users } = db;
  const builderId = userData?.builder_id;

  const where = { is_deleted: false };
  if (colorCategoryId) {
    where.color_category_id = colorCategoryId;
  }

  const { count, rows } = await ColorSubCategory.findAndCountAll({
    where,
    include: [
      {
        model: ColorCategory,
        as: "colorCategory",
        where: { builder_id: builderId, is_deleted: false },
        attributes: [], // We only join for the builder_id check
        required: true,
      },
      {
        model: Users,
        as: "createdByUser",
        attributes: ["users_id", "name"],
      },
      {
        model: Users,
        as: "updatedByUser",
        attributes: ["users_id", "name"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return {
    colorSubCategories: rows.map(transformRow),
    totalItems: count,
  };
};

/**
 * Get a single color sub-category by ID.
 */
export const getColorSubCategoryByIdService = async (userData, id) => {
  const { ColorSubCategory, ColorCategory } = await resolveBySubCategoryId(id);
  const { Users } = db;
  const builderId = userData?.builder_id;

  const row = await ColorSubCategory.findOne({
    where: { color_sub_category_id: id, is_deleted: false },
    include: [
      {
        model: ColorCategory,
        as: "colorCategory",
        where: { builder_id: builderId, is_deleted: false },
        attributes: [],
        required: true,
      },
      {
        model: Users,
        as: "createdByUser",
        attributes: ["users_id", "name"],
      },
      {
        model: Users,
        as: "updatedByUser",
        attributes: ["users_id", "name"],
      },
    ],
  });

  if (!row) {
    throw { status: 404, message: "Color sub-category not found." };
  }

  return transformRow(row);
};

/**
 * Create a new color sub-category.
 */
export const createColorSubCategoryService = async (userData, body) => {
  const { colorCategoryId, name, description } = body;
  const { ColorSubCategory, ColorCategory, isJob } = await resolveByCategoryId(colorCategoryId);
  const { Users } = db;
  const builderId = userData?.builder_id;
  const userId = userData?.users_id;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Verify category existence and ownership
    const category = await ColorCategory.findOne({
      where: { color_category_id: colorCategoryId, builder_id: builderId, is_deleted: false },
      transaction,
    });
    if (!category) {
      throw { status: 400, message: "Invalid colorCategoryId." };
    }

    // 2. Check for duplicate name in this category
    const duplicate = await ColorSubCategory.findOne({
      where: { color_category_id: colorCategoryId, name, is_deleted: false },
      transaction,
    });
    if (duplicate) {
      throw { status: 400, message: "Color sub-category name already exists in this category." };
    }

    const scope = isJob ? { job_id: category.job_id } : {};

    // 3. Create
    const newRecord = await ColorSubCategory.create(
      {
        color_category_id: colorCategoryId,
        name,
        description: description || null,
        created_by_id: userId,
        updated_by_id: userId,
        ...scope,
      },
      { transaction },
    );

    await transaction.commit();

    // Fetch again to get user details for response
    return await getColorSubCategoryByIdService(userData, newRecord.color_sub_category_id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Update a color sub-category.
 */
export const updateColorSubCategoryService = async (userData, id, body) => {
  const { ColorSubCategory, ColorCategory } = await resolveBySubCategoryId(id);
  const builderId = userData?.builder_id;
  const userId = userData?.users_id;
  const { name, description } = body;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Verify ownership
    const record = await ColorSubCategory.findOne({
      where: { color_sub_category_id: id, is_deleted: false },
      include: [
        {
          model: ColorCategory,
          as: "colorCategory",
          where: { builder_id: builderId, is_deleted: false },
          attributes: [],
          required: true,
        },
      ],
      transaction,
    });

    if (!record) {
      throw { status: 404, message: "Color sub-category not found or already deleted." };
    }

    // 2. Update
    await record.update(
      {
        name: name !== undefined ? name : record.name,
        description: description !== undefined ? description : record.description,
        updated_by_id: userId,
        updatedAt: new Date(),
      },
      { transaction },
    );

    await transaction.commit();
    return await getColorSubCategoryByIdService(userData, id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Soft delete a color sub-category.
 */
export const deleteColorSubCategoryService = async (userData, id) => {
  const { ColorSubCategory, ColorCategory } = await resolveBySubCategoryId(id);
  const builderId = userData?.builder_id;
  const userId = userData?.users_id;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Verify
    const record = await ColorSubCategory.findOne({
      where: { color_sub_category_id: id, is_deleted: false },
      include: [
        {
          model: ColorCategory,
          as: "colorCategory",
          where: { builder_id: builderId, is_deleted: false },
          attributes: [],
          required: true,
        },
      ],
      transaction,
    });

    if (!record) {
      throw { status: 404, message: "Color sub-category not found or already deleted." };
    }

    // 2. Soft delete
    await record.update(
      { is_deleted: true, updated_by_id: userId, updatedAt: new Date() },
      { transaction },
    );

    await transaction.commit();
    return await getColorSubCategoryByIdService(userData, id).catch(() => record); // record if not found (because it's now deleted)
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default {
  getAllColorSubCategoriesService,
  getColorSubCategoryByIdService,
  createColorSubCategoryService,
  updateColorSubCategoryService,
  deleteColorSubCategoryService,
};
