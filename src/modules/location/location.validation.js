import Joi from "joi";

export const createLocationSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  status: Joi.boolean().default(true),
});

export const getAllLocationSchema = Joi.object({
  name: Joi.string().trim().max(150).optional(),
  status: Joi.boolean().optional(),
});

export const deleteLocationSchema = Joi.object({
  location_id: Joi.string().uuid().required().messages({
    "string.guid": "location ID must be a valid UUID",
    "any.required": "location ID is required",
  }),
});

export const updateLocationParamsSchema = Joi.object({
  location_id: Joi.string().uuid().required().messages({
    "string.guid": "location ID must be a valid UUID",
    "any.required": "location ID is required",
  }),
});

export const updateLocationShema = Joi.object({
  name: Joi.string().trim().max(150).optional(),
  status: Joi.boolean().optional(),
});

export default {
  createLocationSchema,
  deleteLocationSchema,
  updateLocationParamsSchema,
  updateLocationShema,
  getAllLocationSchema,
};
