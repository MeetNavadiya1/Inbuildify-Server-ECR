import Joi from "joi";

export const createQuotationSchema = Joi.object({
  leads_id: Joi.string().uuid().required().messages({
    "string.guid": "Lead ID must be a valid UUID",
    "any.required": "Lead ID is required",
  }),
});

export const deleteQuotationSchema = Joi.object({
  quotation_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation ID must be a valid UUID",
    "any.required": "Quotation ID is required",
  }),
});

export const getQuotationVersionsQuerySchema = Joi.object({
  version_id: Joi.string().uuid().optional().messages({
    "string.guid": "Version ID must be a valid UUID",
  }),
});

export const updateQuotationVersionParamsSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation Version ID must be a valid UUID",
    "any.required": "Quotation Version ID is required",
  }),
});

export const duplicateQuotationVersionSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation Version ID must be a valid UUID",
    "any.required": "Quotation Version ID is required",
  }),
});

export const updateQuotationVersionBodySchema = Joi.object({
  location_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Location ID must be a valid UUID",
  }),
  range_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Range ID must be a valid UUID",
  }),
  dwelling_type_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Dwelling Type ID must be a valid UUID",
  }),
  floor_plan_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Floor Plan ID must be a valid UUID",
  }),
  facade_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Facade ID must be a valid UUID",
  }),
  structure_engineer_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Structure Engineer ID must be a valid UUID",
  }),
  is_approve: Joi.boolean().optional().messages({
    "boolean.base": "is_approve must be a boolean",
  }),
  sketch_number: Joi.number().precision(2).max(99999999).optional().allow(null).messages({
    "number.base": "Sketch number must be a number",
  }),
  upload_report: Joi.string().optional().allow(null).messages({
    "string.base": "Upload report must be a string",
  }),
});

export const sendEngineerEmailBodySchema = Joi.object({
  subject: Joi.string().trim().min(1).optional().allow(null, "").messages({
    "string.empty": "Subject must not be empty when provided",
  }),
  email_body: Joi.string().trim().min(1).optional().allow(null, "").messages({
    "string.empty": "Email body must not be empty when provided",
  }),
  template_email_id: Joi.string().uuid().optional().allow(null, "").messages({
    "string.guid": "Template Email ID must be a valid UUID",
  }),
});

export const removePackageFromVersionSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation Version ID must be a valid UUID",
    "any.required": "Quotation Version ID is required",
  }),
  package_id: Joi.string().uuid().required().messages({
    "string.guid": "Package ID must be a valid UUID",
    "any.required": "Package ID is required",
  }),
});

export const compareQuotationVersionsBodySchema = Joi.object({
  versions: Joi.array()
    .items(
      Joi.object({
        quotation_id: Joi.string().uuid().required().messages({
          "string.guid": "Quotation ID must be a valid UUID",
          "any.required": "Quotation ID is required",
        }),
        version_id: Joi.string().uuid().required().messages({
          "string.guid": "Version ID must be a valid UUID",
          "any.required": "Version ID is required",
        }),
      }),
    )
    .length(2)
    .required()
    .messages({
      "array.base": "Versions must be an array of length 2",
      "array.length": "You must provide exactly two versions to compare",
      "any.required": "Versions are required",
    }),
  show_all: Joi.boolean().optional().default(true).messages({
    "boolean.base": "show_all must be a boolean",
  }),
});

export const compareQuotationVersionsParamsSchema = Joi.object({
  leads_id: Joi.string().uuid().required().messages({
    "string.guid": "Lead ID must be a valid UUID",
    "any.required": "Lead ID is required",
  }),
});

// Master-data entities whose quotation usage can be listed. Must stay in sync
// with QuotationRepository.USAGE_CONDITIONS.
export const QUOTATION_USAGE_ENTITY_TYPES = [
  "price-list",
  "price-list-item",
  "floor-plan",
  "facade",
  "package",
  "color",
  "color-category",
  "color-item",
  "color-group",
];

export const quotationUsageHistoryParamsSchema = Joi.object({
  entity_type: Joi.string()
    .valid(...QUOTATION_USAGE_ENTITY_TYPES)
    .required()
    .messages({
      "any.only": `Entity type must be one of: ${QUOTATION_USAGE_ENTITY_TYPES.join(", ")}`,
      "any.required": "Entity type is required",
    }),
  entity_id: Joi.string().uuid().required().messages({
    "string.guid": "Entity ID must be a valid UUID",
    "any.required": "Entity ID is required",
  }),
});

export const quotationUsageHistoryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1).messages({
    "number.base": "Page must be a number",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(100).optional().default(10).messages({
    "number.base": "Limit must be a number",
    "number.max": "Limit cannot exceed 100",
  }),
  referenceNo: Joi.string().allow("").optional(),
  customerName: Joi.string().allow("").optional(),
  propertyAddress: Joi.string().allow("").optional(),
  quotationStatus: Joi.string()
    .allow("")
    .valid("", "all", "approved", "cancelled", "modified", "expired")
    .optional()
    .messages({
      "any.only": "Quotation status must be one of: approved, cancelled, modified, expired",
    }),
  leadStatus: Joi.string().allow("").valid("", "All", "Open", "Closed Won").optional().messages({
    "any.only": "Lead status must be one of: Open, Closed Won",
  }),
});

export default {
  createQuotationSchema,
  quotationUsageHistoryParamsSchema,
  quotationUsageHistoryQuerySchema,
  deleteQuotationSchema,
  updateQuotationVersionParamsSchema,
  updateQuotationVersionBodySchema,
  duplicateQuotationVersionSchema,
  compareQuotationVersionsParamsSchema,
  compareQuotationVersionsBodySchema,
  removePackageFromVersionSchema,
  getQuotationVersionsQuerySchema,
  sendEngineerEmailBodySchema,
};
