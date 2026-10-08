import db from "../../config/database/models/postgre-models/index.js";

/**
 * Job-specific color configuration isolation.
 *
 * Color configurations can live in two parallel table families:
 *   - Global TEMPLATE tables: color / color_category / color_sub_category /
 *     color_item / color_item_custom_field / color_group_item_map
 *   - JOB-specific instance tables: job_color / job_color_category /
 *     job_color_sub_category / job_color_item / job_color_item_custom_field /
 *     job_color_group_item_map
 *
 * This router resolves which table family an entity ID lives in and returns the
 * corresponding model set, so CRUD operations can stay generic.
 */

export function templateSet() {
  return {
    isJob: false,
    Color: db.Color,
    ColorCategory: db.ColorCategory,
    ColorSubCategory: db.ColorSubCategory,
    ColorItem: db.ColorItem,
    ColorItemCustomField: db.ColorItemCustomField,
    ColorGroupItemMap: db.ColorGroupItemMap,
  };
}

export function jobSet() {
  return {
    isJob: true,
    Color: db.JobColor,
    ColorCategory: db.JobColorCategory,
    ColorSubCategory: db.JobColorSubCategory,
    ColorItem: db.JobColorItem,
    ColorItemCustomField: db.JobColorItemCustomField,
    ColorGroupItemMap: db.JobColorGroupItemMap,
  };
}

export async function resolveByColorId(colorId) {
  const found = await db.JobColor.findByPk(colorId, { attributes: ["color_id"] });
  return found ? jobSet() : templateSet();
}

export async function resolveByCategoryId(categoryId) {
  const found = await db.JobColorCategory.findByPk(categoryId, { attributes: ["color_category_id"] });
  return found ? jobSet() : templateSet();
}

export async function resolveBySubCategoryId(subCategoryId) {
  const found = await db.JobColorSubCategory.findByPk(subCategoryId, { attributes: ["color_sub_category_id"] });
  return found ? jobSet() : templateSet();
}

export async function resolveByItemId(itemId) {
  const found = await db.JobColorItem.findByPk(itemId, { attributes: ["color_item_id"] });
  return found ? jobSet() : templateSet();
}

export default {
  templateSet,
  jobSet,
  resolveByColorId,
  resolveByCategoryId,
  resolveBySubCategoryId,
  resolveByItemId,
};
