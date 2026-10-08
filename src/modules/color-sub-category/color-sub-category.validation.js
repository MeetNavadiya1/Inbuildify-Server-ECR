import Joi from "joi";

export const getAllColorSubCategoriesSchema = Joi.object({
  limit: Joi.number().optional().default(25).max(50),
  offset: Joi.number().optional().default(0).max(1000),
  colorCategoryId: Joi.string().uuid().optional(),
});

export const getAllColorSubCategoriesParamsSchema = Joi.object({
  color_category_id: Joi.string().uuid().required().messages({
    "string.guid": "Color Category ID must be a valid UUID",
    "any.required": "Color Category ID is required",
  }),
});

export const createColorSubCategorySchema = Joi.object({
  colorCategoryId: Joi.string().uuid().required().messages({
    "string.guid": "Color Category ID must be a valid UUID",
    "any.required": "Color Category ID is required",
  }),
  name: Joi.string().required().min(2).max(100),
  description: Joi.string().optional(),
});

export const updateColorSubCategorySchema = Joi.object({
  name: Joi.string().optional().min(2).max(100),
  description: Joi.string().optional(),
}).min(1).message({ "object.min": "At least one field is required to update" });

export const colorSubCategoryIdParamSchema = Joi.object({
  color_sub_category_id: Joi.string().uuid().required().messages({
    "string.guid": "Color Sub-Category ID must be a valid UUID",
    "any.required": "Color Sub-Category ID is required",
  }),
});

export default {
  getAllColorSubCategoriesSchema,
  getAllColorSubCategoriesParamsSchema,
  createColorSubCategorySchema,
  updateColorSubCategorySchema,
  colorSubCategoryIdParamSchema,
};
