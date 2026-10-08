import Joi from "joi";

export const getStateSchema = Joi.object({
  country_id: Joi.string().uuid().required(),
});

export default {
  getStateSchema,
};
