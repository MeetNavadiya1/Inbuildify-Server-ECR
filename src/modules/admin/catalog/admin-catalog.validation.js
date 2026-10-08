import Joi from "joi";

import { USAGE_SORTS } from "./admin-catalog.service.js";

const listKeys = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  company_id: Joi.string().uuid().optional(),
  status: Joi.boolean().optional(),
  sort: Joi.string().valid(...USAGE_SORTS).default("most_used"),
};

export const listFacadesSchema = Joi.object(listKeys);
export const listDwellingsSchema = Joi.object(listKeys);

export default { listFacadesSchema, listDwellingsSchema };
