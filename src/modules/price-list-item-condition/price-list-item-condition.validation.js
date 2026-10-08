import Joi from "joi";

export const createPriceListItemConditionValidation = Joi.object({
  price_list_item_id: Joi.string().uuid().required().messages({
    "string.uuid": "price_list_item_id must be a valid UUID",
    "any.required": "price_list_item_id is required",
  }),
  condition_name: Joi.string()
    .max(255)
    .valid("site_fall", "land_size", "corner_block", "land_fill")
    .required()
    .messages({
      "any.only":
        "condition_name must be one of: site_fall, land_size, corner_block, land_fill",
      "any.required": "condition_name is required",
    }),
  status: Joi.boolean().when("condition_name", {
    is: Joi.string().valid("corner_block"),
    then: Joi.required().messages({
      "any.required": "status is required when condition_name is corner_block",
    }),
    otherwise: Joi.optional(),
  }),
  range_start: Joi.number().when("condition_name", {
    is: Joi.string().valid("site_fall", "land_size", "land_fill"),
    then: Joi.required().messages({
      "any.required":
        "range_start is required when condition_name is site_fall, land_size, or land_fill",
    }),
    otherwise: Joi.forbidden().messages({
      "any.unknown":
        "range_start is not allowed when condition_name is corner_block",
    }),
  }),
  range_end: Joi.number().when("condition_name", {
    is: Joi.valid("site_fall", "land_size", "land_fill"),
    then: Joi.number().required().greater(Joi.ref("range_start")).messages({
      "any.required":
        "range_end is required when condition_name is site_fall, land_size, or land_fill",
      "number.greater": "range_end must be greater than range_start",
    }),
    otherwise: Joi.forbidden().messages({
      "any.unknown":
        "range_end is not allowed when condition_name is corner_block",
    }),
  }),
});

export const updatePriceListItemConditionValidation = Joi.object({
  condition_name: Joi.string()
    .max(255)
    .valid("site_fall", "land_size", "corner_block", "land_fill")
    .messages({
      "any.only":
        "condition_name must be one of: site_fall, land_size, corner_block, land_fill",
    }),
  status: Joi.boolean().messages({
    "boolean.base": "status must be a boolean",
  }),
  range_start: Joi.number().messages({
    "number.base": "range_start must be a number",
  }),
  range_end: Joi.number().messages({
    "number.base": "range_end must be a number",
  }),
})
  .custom((value, helpers) => {
    // Custom validation for range_start and range_end relationship
    if (value.range_start !== undefined && value.range_end !== undefined) {
      if (value.range_start >= value.range_end) {
        return helpers.error("custom.rangeOrder");
      }
    }

    // Validate that range_start and range_end are not provided for corner_block
    if (value.condition_name === "corner_block") {
      if (value.range_start !== undefined || value.range_end !== undefined) {
        return helpers.error("custom.cornerBlockRange");
      }
    }

    return value;
  })
  .messages({
    "custom.rangeOrder": "range_start must be less than range_end",
    "custom.cornerBlockRange":
      "range_start and range_end are not allowed when condition_name is corner_block",
  });

export const getPriceListItemConditionByIdValidation = Joi.object({
  price_list_item_condition_id: Joi.string().uuid().required().messages({
    "string.uuid": "price_list_item_condition_id must be a valid UUID",
    "any.required": "price_list_item_condition_id is required",
  }),
});

export const deletePriceListItemConditionValidation = Joi.object({
  price_list_item_condition_id: Joi.string().uuid().required().messages({
    "string.uuid": "price_list_item_condition_id must be a valid UUID",
    "any.required": "price_list_item_condition_id is required",
  }),
});

export const getAllPriceListItemConditionsValidation = Joi.object({
  price_list_item_id: Joi.string().uuid().optional().messages({
    "string.uuid": "price_list_item_id must be a valid UUID",
  }),
});

export default {
  createPriceListItemConditionValidation,
  updatePriceListItemConditionValidation,
  getPriceListItemConditionByIdValidation,
  deletePriceListItemConditionValidation,
  getAllPriceListItemConditionsValidation,
};
