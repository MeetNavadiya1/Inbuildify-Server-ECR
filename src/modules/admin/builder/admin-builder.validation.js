import Joi from "joi";

export const listBuildersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  sort_by: Joi.string().valid("name", "companyName", "company_name", "createdAt", "created_at", "leads", "users", "jobs").optional(),
  sort_dir: Joi.string().valid("asc", "desc").optional(),
});

export const builderIdSchema = Joi.object({
  company_id: Joi.string().uuid().required(),
});

export default { listBuildersSchema, builderIdSchema };
