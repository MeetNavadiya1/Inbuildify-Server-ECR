import Joi from "joi";

export const createHouseLandPackageSettingSchema = Joi.object({
  include_facade_cost_in_total: Joi.boolean().default(false),
});

export const updateHouseLandPackageSettingParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const updateHouseLandPackageSettingSchems = Joi.object({
  include_facade_cost_in_total: Joi.bool().default(false),
});

export default {
  createHouseLandPackageSettingSchema,
  updateHouseLandPackageSettingParamsSchema,
  updateHouseLandPackageSettingSchems,
};
