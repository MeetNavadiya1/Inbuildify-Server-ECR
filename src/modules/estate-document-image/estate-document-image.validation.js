import Joi from "joi";

// Document names are derived from uploaded filenames, which legitimately contain
// underscores, parentheses, ampersands, plus signs, etc. Require at least one
// letter and disallow only angle brackets (HTML-injection guard).
const DOCUMENT_NAME_PATTERN = /^(?=.*[a-zA-Z])[^<>]+$/;

/* -----------------------------
   ESTATE IMAGES VALIDATION
------------------------------ */

export const getEstateImageSchema = Joi.object({
  estate_id: Joi.string().uuid().required().messages({
    "any.required": "Estate ID is required",
    "string.base": "Estate ID must be a string",
    "string.uuid": "Estate ID must be a valid UUID",
  }),
});

export const updateEstateImageParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "any.required": "Estate ID is required",
    "string.base": "Estate ID must be a string",
    "string.uuid": "Estate ID must be a valid UUID",
  }),
});

export const updateEstateImageSchema = Joi.object({
  image_url: Joi.string().uri().max(500).allow(null, "").optional(),
  imageUrl: Joi.string().uri().max(500).allow(null, "").optional(),
}).or("image_url", "imageUrl");

/* -----------------------------
   ESTATE DOCUMENTS VALIDATION
------------------------------ */

export const createEstateDocumentSchema = Joi.object({
  estate_id: Joi.string().uuid().required().messages({
    "any.required": "Estate ID is required",
    "string.base": "Estate ID must be a string",
    "string.uuid": "Estate ID must be a valid UUID",
  }),
  document_name: Joi.string()
    .min(2)
    .max(255)
    .pattern(DOCUMENT_NAME_PATTERN)
    .required()
    .messages({
      "any.required": "Document name is required",
      "string.base": "Document name must be a string",
      "string.max": "Document name must not exceed 255 characters",
    }),
  file_url: Joi.string().uri().max(500).allow(null, "").optional(),
});

export const updateEstateDocumentSchema = Joi.object({
  document_name: Joi.string()
    .min(2)
    .max(255)
    .pattern(DOCUMENT_NAME_PATTERN)
    .optional(),
  file_url: Joi.string().uri().max(500).allow(null, "").optional(),
  fileUrl: Joi.string().uri().max(500).allow(null, "").optional(),
});

export default {
  getEstateImageSchema,
  updateEstateImageParamsSchema,
  updateEstateImageSchema,
  createEstateDocumentSchema,
  updateEstateDocumentSchema,
};
