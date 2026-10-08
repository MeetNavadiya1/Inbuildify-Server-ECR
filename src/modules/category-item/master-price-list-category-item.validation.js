import Joi from "joi";

const costTypes = ["included", "fixed", "variable"];
const costOptions = ["none", "tba", "tbc"];
const itemStatuses = ["ACTIVE", "INACTIVE"];

const conditionSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required().messages({
    "string.base": "Condition name must be a string",
    "string.empty": "Condition name is required",
    "any.required": "Condition name is required",
  }),
  range_start: Joi.number().precision(2).required().messages({
    "number.base": "Range start must be a number",
    "any.required": "Range start is required",
  }),
  range_end: Joi.number()
    .precision(2)
    .greater(Joi.ref("range_start"))
    .required()
    .messages({
      "number.base": "Range end must be a number",
      "any.required": "Range end is required",
      "number.greater": "Range end not be greater than range start",
    }),
});

export const createMasterPriceListCategoryItemSchema = Joi.object({
  master_price_list_category_id: Joi.string().uuid().required().messages({
    "string.guid": "Category ID must be a valid UUID",
    "any.required": "Category ID is required",
  }),
  name: Joi.string().trim().min(2).max(255).required(),
  sku: Joi.string().min(2).max(100).optional(),
  full_description: Joi.string().min(2).max(1000).required(),
  short_description: Joi.string().max(500).optional().allow(null, ""),
  item_type: Joi.string().min(2).max(100).optional(),
  cost_type: Joi.string()
    .valid(...costTypes)
    .required(),
  cost: Joi.number()
    .precision(2)
    .optional()
    .allow(null)
    .greater(0)
    .less(1000000)
    .messages({
      "number.base": "cost must be a valid number",
      "number.unsafe":
        "cost value is too large, please provide a valid 0 to 1000000 number",
      "number.greater": "cost must be greater than 0",
      "number.less": "cost must be less than 1000000",
    }),
  cost_type_text: Joi.string().max(255).optional().allow(null),
  cost_option: Joi.string()
    .valid(...costOptions)
    .default("NONE"),
  currency: Joi.string().min(2).max(10).default("AUD").optional(),
  is_standard: Joi.boolean().default(false),
  is_upgrade: Joi.boolean().default(false),
  include_by_default: Joi.boolean().default(false),
  show_in_hl_package: Joi.boolean().default(true),
  package_only: Joi.boolean().default(false),
  uom: Joi.string().max(50).optional().allow(null),
  sort_order: Joi.number().integer().min(0).default(0),
  range: Joi.string().optional().allow(null),
  dwelling: Joi.string().optional().allow(null),
  conditions: Joi.array()
    .items(conditionSchema)
    .unique((a, b) => a.name === b.name)
    .optional()
    .messages({
      "array.unique": "Each condition must be unique by name",
    }),
  status: Joi.string()
    .valid(...itemStatuses)
    .default("ACTIVE"),
  extra: Joi.object()
    .pattern(
      Joi.string().min(1),
      Joi.alternatives().try(
        Joi.string(),
        Joi.number(),
        Joi.boolean(),
        Joi.array().items(Joi.any()),
        Joi.object(),
      ),
    )
    .default({})
    .messages({
      "object.base": "Extra must be a valid JSON object.",
    }),
})
  .custom((value, helpers) => {
    if (value.cost_type === "FIXED") {
      if (!value.cost || Number(value.cost) <= 0) {
        return helpers.error("cost.fixed.required");
      }
      if (Number(value.cost) > 1000000) {
        return helpers.error("cost.fixed.tooLarge");
      }
    } else if (value.cost_type === "VARIABLE") {
      if (!value.range && !value.dwelling) {
        return helpers.error("cost.variable.rangeOrDwelling");
      }
      if (value.include_by_default === true || value.package_only === true) {
        return helpers.error("cost.variable.flagsForbidden");
      }
    } else if (value.cost_type === "INCLUDED") {
      if (!value.cost_type_text || value.cost_type_text.trim() === "") {
        return helpers.error("cost.included.textRequired");
      }
      if (value.cost_option !== "NONE") {
        return helpers.error("cost.included.optionForbidden");
      }
    }

    return value;
  })
  .messages({
    "cost.fixed.required":
      "cost is required and must be greater than 0 when cost_type is FIXED",
    "cost.fixed.tooLarge":
      "cost cannot be greater than 1000000 when cost_type is FIXED",
    "cost.variable.rangeOrDwelling":
      "VARIABLE cost_type requires either range or dwelling",
    "cost.variable.flagsForbidden":
      "VARIABLE cost_type cannot include include_by_default or package_only",
    "cost.included.textRequired":
      "cost_type_text is required when cost_type is INCLUDED",
    "cost.included.optionForbidden":
      "cost_option is not allowed when cost_type is INCLUDED",
  });

export const updateMasterPriceListCategoryItemSchema =
  createMasterPriceListCategoryItemSchema.keys({
    master_price_list_category_id: Joi.forbidden(),
    name: Joi.string().trim().min(2).max(50).optional(),
    full_description: Joi.string().min(2).max(1000).optional(),
    cost_type: Joi.string()
      .valid(...costTypes)
      .optional(),
  });

export const getMasterPriceListCategoryItemsByCategoryIdSchema = Joi.object({
  item_type: Joi.string().optional(),
});

export const deleteMasterPriceListCategoryItemSchema = Joi.object({
  category_item_id: Joi.string().uuid().required().messages({
    "string.guid": "Category item ID must be a valid UUID",
    "any.required": "Category item ID is required",
  }),
});

export default {
  createMasterPriceListCategoryItemSchema,
  updateMasterPriceListCategoryItemSchema,
  getMasterPriceListCategoryItemsByCategoryIdSchema,
  deleteMasterPriceListCategoryItemSchema,
};
