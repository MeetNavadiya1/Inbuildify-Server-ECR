import Joi from "joi";

export const getAllDocumentFolderMappingsSchema = Joi.object({
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

export const updateDocumentFolderMappingSchema = Joi.object({
  signed_quotation: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Signed quotation folder ID must be a valid UUID",
  }),
  signed_color: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Signed color folder ID must be a valid UUID",
  }),
  signed_variation: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Signed variation folder ID must be a valid UUID",
  }),
  signed_maintenance: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Signed maintenance folder ID must be a valid UUID",
  }),
  signed_contract_document: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Signed contract document folder ID must be a valid UUID",
  }),
  compliance_certificate: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Compliance certificate folder ID must be a valid UUID",
  }),
  purchase_order: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Purchase order folder ID must be a valid UUID",
  }),
  job_documents: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Job documents folder ID must be a valid UUID",
  }),
  select_all_files_from_folder: Joi.boolean().optional(),
}).min(1);

export default {
  getAllDocumentFolderMappingsSchema,
  updateDocumentFolderMappingSchema,
};
