import Joi from "joi";

export const getActivitiesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  search: Joi.string().optional().allow(""),
  module: Joi.string().optional().allow(""),
});

export const getActivitiesTimelineQuerySchema = Joi.object({
  search: Joi.string().optional().allow(""),
  module: Joi.string().optional().allow(""),
});
