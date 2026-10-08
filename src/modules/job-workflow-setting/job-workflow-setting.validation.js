import Joi from "joi";

export const createJobWorkflowSettingSchema = Joi.object({
  show_all_tasks_to_all_roles: Joi.boolean().default(false),
  include_weekend_date: Joi.boolean().default(false),
  include_holiday_date: Joi.boolean().default(false),
  recalculate_estimated_end_dates_future_tasks: Joi.boolean().default(false),
  recalculate_estimated_dates_based_on_actual_changes:
    Joi.boolean().default(false),
});

export const updateJobWorkflowSettingParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "job workflow id must be a valid UUID",
    "any.required": " job workflow od is required",
  }),
}).unknown(true)

export const updateJobWorkflowSettingSchema = Joi.object({
  show_all_tasks_to_all_roles: Joi.boolean().default(false),
  include_weekend_date: Joi.boolean().default(false),
  include_holiday_date: Joi.boolean().default(false),
  recalculate_estimated_end_dates_future_tasks: Joi.boolean().default(false),
  recalculate_estimated_dates_based_on_actual_changes:
    Joi.boolean().default(false),
}).unknown(true)

export default {
  createJobWorkflowSettingSchema,
  updateJobWorkflowSettingParamsSchema,
  updateJobWorkflowSettingSchema,
};
