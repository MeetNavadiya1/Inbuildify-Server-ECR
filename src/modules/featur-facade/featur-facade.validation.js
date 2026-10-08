import Joi from "joi";

export const createFeatureFacadeSchema = Joi.object({
    builder_id: Joi.string().uuid().optional().messages({
        "string.guid": "builder_id must be a valid UUID",
    }),
    company_id: Joi.string().uuid().optional().messages({
        "string.guid": "company_id must be a valid UUID",
    }),
    start_date: Joi.date().required().messages({
        "date.base": "start_date must be a valid date",
        "any.required": "start_date is required",
    }),
    end_date: Joi.date().required().messages({
        "date.base": "end_date must be a valid date",
        "any.required": "end_date is required",
    }),
    is_active: Joi.boolean().default(true).messages({
        "boolean.base": "is_active must be a boolean value",
    }),
    facade_id: Joi.string().uuid().optional().messages({
        "string.guid": "facade_id must be a valid UUID",
    }),
});

export const updateFeatureFacadeSchema = Joi.object({
    builder_id: Joi.string().uuid().optional().messages({
        "string.guid": "builder_id must be a valid UUID",
    }),
    company_id: Joi.string().uuid().optional().messages({
        "string.guid": "company_id must be a valid UUID",
    }),
    start_date: Joi.date().optional().allow(null),
    end_date: Joi.date().optional().allow(null),
    is_active: Joi.boolean().optional(),
});

export const getFeatureFacadeByIdSchema = Joi.object({
    id: Joi.string().uuid().required().messages({
        "string.guid": "id must be a valid UUID",
        "any.required": "id is required",
    }),
});

export const getFeatureFacadeSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
});

export default {
    createFeatureFacadeSchema,
    updateFeatureFacadeSchema,
    getFeatureFacadeByIdSchema,
    getFeatureFacadeSchema,
};
