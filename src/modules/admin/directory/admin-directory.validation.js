import Joi from "joi";

import { CONTRACTOR_SORTS, SUPPLIER_SORTS } from "./admin-directory.service.js";

const listKeys = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  company_id: Joi.string().uuid().optional(),
  sort_dir: Joi.string().valid("asc", "desc").optional(),
};

export const listContractorsSchema = Joi.object({
  ...listKeys,
  sort_by: Joi.string().valid(...Object.keys(CONTRACTOR_SORTS)).optional(),
});

export const listSuppliersSchema = Joi.object({
  ...listKeys,
  status: Joi.boolean().optional(),
  sort_by: Joi.string().valid(...Object.keys(SUPPLIER_SORTS)).optional(),
});

export default { listContractorsSchema, listSuppliersSchema };
