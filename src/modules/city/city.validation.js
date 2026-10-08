import Joi from "joi";

// By id, or — for the forms that store names — by state name within a country.
export const getCitiesSchema = Joi.object({
  state_id: Joi.string().uuid(),
  state_name: Joi.string().trim().max(100),
  country_id: Joi.string().uuid(),
  country_name: Joi.string().trim().max(100),
}).or("state_id", "state_name");

export default {
  getCitiesSchema,
};
