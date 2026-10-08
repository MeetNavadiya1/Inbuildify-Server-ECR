import Joi from "joi";

export const createMasterSectionItemSchema = Joi.object({
  item_name: Joi.string().min(2).max(2000).required().messages({
    "string.empty": "Item name is required.",
    "string.min": "Item name must be at least 2 characters.",
    "string.max": "Item name must not exceed 2000 characters.",
    "any.required": "Item name is required.",
  }),
  effective_start_date: Joi.date().allow(null).optional().messages({
    "date.base": "Effective start date must be a valid date",
  }),
  effective_end_date: Joi.date().allow(null).optional().messages({
    "date.base": "Effective end date must be a valid date",
  }),
  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
    "number.min": "Sort order must be at least 1",
  }),
  status: Joi.boolean().optional().default(true).messages({
    "boolean.base": "Status must be a boolean value.",
  }),
})
  .custom((value, helpers) => {
    if (value.effective_start_date && value.effective_end_date) {
      const startDate = new Date(value.effective_start_date);
      const endDate = new Date(value.effective_end_date);
      if (startDate > endDate) {
        return helpers.error("custom.dateRange");
      }
    }
    return value;
  })
  .messages({
    "custom.dateRange":
      "Effective start date cannot be after effective end date",
  });

export const updateMasterSectionItemSchema = Joi.object({
  item_name: Joi.string().min(2).max(2000).optional().messages({
    "string.empty": "Item name cannot be empty.",
    "string.min": "Item name must be at least 2 characters.",
    "string.max": "Item name must not exceed 2000 characters.",
  }),
  effective_start_date: Joi.date().allow(null).optional().messages({
    "date.base": "Effective start date must be a valid date",
  }),
  effective_end_date: Joi.date().allow(null).optional().messages({
    "date.base": "Effective end date must be a valid date",
  }),
  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
    "number.min": "Sort order must be at least 1",
  }),
  status: Joi.boolean().optional().messages({
    "boolean.base": "Status must be a boolean value.",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update.",
  })
  .custom((value, helpers) => {
    if (value.effective_start_date && value.effective_end_date) {
      const startDate = new Date(value.effective_start_date);
      const endDate = new Date(value.effective_end_date);
      if (startDate > endDate) {
        return helpers.error("custom.dateRange");
      }
    }
    return value;
  })
  .messages({
    "custom.dateRange":
      "Effective start date cannot be after effective end date",
  });

export const getMasterSectionItemSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be greater than 0",
  }),
  limit: Joi.number().integer().min(1).max(100).default(25).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),
  search: Joi.string().max(255).optional().messages({
    "string.max": "Search term must not exceed 255 characters.",
  }),
  status: Joi.boolean().optional().messages({
    "boolean.base": "Status must be a boolean value.",
  }),
  master_section_header_id: Joi.string().uuid().optional().messages({
    "string.guid": "Master section header must be a valid UUID",
  }),
});

export const paramsItemIdSchema = Joi.object({
  item_id: Joi.string().uuid().required().messages({
    "string.guid": "Item ID must be a valid UUID",
    "any.required": "Item ID is required",
  }),
});

export default {
  // Master Section Item
  createMasterSectionItemSchema,
  updateMasterSectionItemSchema,
  getMasterSectionItemSchema,
  paramsItemIdSchema,
};