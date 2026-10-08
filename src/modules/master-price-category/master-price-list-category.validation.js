import Joi from "joi";

export const getAllMasterPriceListCategoriesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be greater than 0",
  }),

  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),
});

export const createMasterPriceListCategorySchema = Joi.object({
  name: Joi.string().required().min(2).max(200),
  description: Joi.string().optional(),
});

export const updateMasterPriceListCategorySchema = Joi.object({
  name: Joi.string().optional().min(2).max(200),
  description: Joi.string().optional(),
})
  .min(1)
  .message({ "object.min": "At least one field is required to update" });

export const displayOrderManageSchema = Joi.object({
  orderedCategories: Joi.array()
    .items(
      Joi.object({
        categoryId: Joi.string().uuid().required().messages({
          "string.guid": "Category ID must be a valid UUID",
          "any.required": "Category ID is required",
        }),
        displayOrder: Joi.number().integer().required().messages({
          "number.base": "Display Order must be a number",
          "number.integer": "Display Order must be an integer",
          "any.required": "Display Order is required",
        }),
      }),
    )
    .required()
    .messages({
      "array.base":
        "orderedCategories must be an array of objects with categoryId and displayOrder",
    }),
}).unknown(false);

export const deleteMasterPriceListCategorySchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Category ID must be a valid UUID",
    "any.required": "Category ID is required",
  }),
});

export const getMasterPriceListCategoryByIdSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Category ID must be a valid UUID",
    "any.required": "Category ID is required",
  }),
});

export default {
  getAllMasterPriceListCategoriesSchema,
  createMasterPriceListCategorySchema,
  updateMasterPriceListCategorySchema,
  displayOrderManageSchema,
  deleteMasterPriceListCategorySchema,
  getMasterPriceListCategoryByIdSchema,
};
