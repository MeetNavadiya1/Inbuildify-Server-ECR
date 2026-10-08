import Joi from "joi";

const imageRule = Joi.alternatives()
  .try(
    Joi.string().uri().max(500).trim().messages({
      "string.base": "Image must be a string",
      "string.uri": "Image must be a valid URL",
      "string.max": "Image URL must not exceed 500 characters",
    }),
    Joi.object({
      fieldname: Joi.string().valid("image").required(),
      originalname: Joi.string().required(),
      mimetype: Joi.string().required(),
      size: Joi.number()
        .max(10 * 1024 * 1024)
        .required(), // enforce max 10MB
      location: Joi.string().uri().required(), // s3 URL added by multer-s3
    }).unknown(true), // allow extra multer fields
  )
  .optional();

export const createSupplierContactSchema = Joi.object({
  supplier_id: Joi.string().uuid().required().messages({
    "string.guid": "Supplier ID must be a valid UUID",
    "any.required": "Supplier ID is required",
  }),
  induction_pack_received: Joi.boolean().default(false),
  work_cover_image: imageRule.optional().allow(null, ""),
  pl_insurance_image: imageRule.optional().allow(null, ""),
  white_card_image: imageRule.optional().allow(null, ""),
  fork_lift_license_image: imageRule.optional().allow(null, ""),
  trade_license_image: imageRule.optional().allow(null, ""),
  induction_pack_image: imageRule.optional().allow(null, ""),
});

export const getAllSupplierDocumentSchema = Joi.object({
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

export const updateSupplierDocumentParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Supplier document ID must be a valid UUID",
    "any.required": "Supplier document ID is required",
  }),
});

export const updateSupplierDocumentSchema = Joi.object({
  induction_pack_received: Joi.boolean(),
  work_cover_image: imageRule.optional().allow(null, ""),
  pl_insurance_image: imageRule.optional().allow(null, ""),
  white_card_image: imageRule.optional().allow(null, ""),
  fork_lift_license_image: imageRule.optional().allow(null, ""),
  trade_license_image: imageRule.optional().allow(null, ""),
  induction_pack_image: imageRule.optional().allow(null, ""),
});

export default {
  createSupplierContactSchema,
  getAllSupplierDocumentSchema,
  updateSupplierDocumentParamsSchema,
  updateSupplierDocumentSchema,
};
