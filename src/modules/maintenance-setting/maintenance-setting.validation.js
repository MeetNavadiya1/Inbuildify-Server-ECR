import Joi from "joi";

export const createMaintenanceSettingSchema = Joi.object({
  area_enabled: Joi.boolean().default(false),
  supplier_enabled: Joi.boolean().default(false),
  allow_completion_without_supplier_response: Joi.boolean().default(false),
  request_date_enabled: Joi.boolean().default(false),
  task_date_enabled: Joi.boolean().default(false),
  repair_cost_enabled: Joi.boolean().default(false),
  hours_spent_enabled: Joi.boolean().default(false),
  maintenance_start_date: Joi.date().allow(null),
  handover_date: Joi.date().allow(null),
  maintenance_period_days: Joi.number().integer().min(0).allow(null),
  maintenance_duration_days: Joi.number().integer().min(0).allow(null),
  supervisor_roles: Joi.array().items(Joi.string().uuid()).default([]),
});

export const updateMaintenanceSettingParamsSchema = Joi.object({
  maintenance_settings_id: Joi.string().uuid().required().messages({
    "string.guid": "Maintenance setting ID must be a valid UUID",
    "any.required": "maintenance setting ID is required",
  }),
});
export const updateMaintenanceSettingSchema = Joi.object({
  area_enabled: Joi.boolean(),
  supplier_enabled: Joi.boolean(),
  allow_completion_without_supplier_response: Joi.boolean(),
  request_date_enabled: Joi.boolean(),
  task_date_enabled: Joi.boolean(),
  repair_cost_enabled: Joi.boolean(),
  hours_spent_enabled: Joi.boolean(),
  maintenance_start_date: Joi.string()
    .trim()
    .max(100)
    .valid("handover_date", "occupancy_permit_date")
    .optional(),
  maintenance_period_days: Joi.number()
    .integer()
    .min(0)
    .max(565)
    .optional()
    .allow(null),
  maintenance_duration_days: Joi.number()
    .integer()
    .min(0)
    .max(365)
    .optional()
    .allow(null),
  supervisor_roles: Joi.array()
    .items(Joi.string().uuid())
    .optional(),
}).custom((value, helpers) => {
  if (
    value.supplier_enabled === false &&
    value.allow_completion_without_supplier_response === true
  ) {
    return helpers.message(
      "Cannot allow completion without supplier response when supplier is disabled.",
    );
  }
  return value;
});

export default {
  createMaintenanceSettingSchema,
  updateMaintenanceSettingParamsSchema,
  updateMaintenanceSettingSchema,
};
