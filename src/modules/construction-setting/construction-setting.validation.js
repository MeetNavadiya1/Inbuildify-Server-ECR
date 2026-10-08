import Joi from "joi";

export const createConstructionSettingSchema = Joi.object({
  suppliers_tradies_madatory_to_complete_checklist:
    Joi.boolean().default(false),
  allow_checklist_even_supplier_tradies_not_responded:
    Joi.boolean().default(false),
  show_warning_when_supplier_trade_booked_same_day_for_checklist:
    Joi.boolean().default(false),
  sending_email_private_inspector_mandatory: Joi.boolean().default(false),
  make_inspection_chacklist_mandatory: Joi.boolean().default(false),
  include_weekend_date: Joi.boolean().default(false),
  include_holiday_date: Joi.boolean().default(false),
  include_onhold_date: Joi.boolean().default(false),
  allow_stage_date_change: Joi.boolean().default(false),
  default_lead_time_for_supplier_trade: Joi.boolean().default(false),
  no_of_reminder_days: Joi.number().integer().default(7).optional().max(365),
  allow_move_next_stage_even_checklist_not_completed:
    Joi.boolean().default(false),
  apply_changes_all_existing_jobs: Joi.boolean().default(false),
  rebook_confrimed_bookings_on_date_changes: Joi.boolean().default(false),
  send_email_when_stage_completed: Joi.boolean().default(false),
  move_jobs_from_ready_for_construction_to_under_construction:
    Joi.boolean().default(false),
  recalculate_stage_date_construction_days_when_deleys_captured:
    Joi.boolean().default(false),
  enable_forcast_date: Joi.boolean().default(false),
  number_of_days_site_start_from_title_date: Joi.number()
    .integer()
    .default(90)
    .min(1)
    .max(365)
    .optional(),
  label_for_permit_received_date: Joi.string().trim().max(255).optional(),

  site_supervisor_roles: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "site supervisor role id must be a valid UUID",
    }),

  stage_completion_date: Joi.string()
    .trim()
    .max(50)
    .valid("claim", "move_to_next_page"),

  admin_coordinator_roles: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "admin coordinator role id must be a valid UUID",
    }),
});

export const updateConstructionSettingSchema = Joi.object({
  suppliers_tradies_madatory_to_complete_checklist: Joi.boolean().optional(),
  allow_checklist_even_supplier_tradies_not_responded: Joi.boolean().optional(),
  show_warning_when_supplier_trade_booked_same_day_for_checklist:
    Joi.boolean().optional(),
  sending_email_private_inspector_mandatory: Joi.boolean().optional(),
  make_inspection_chacklist_mandatory: Joi.boolean().optional(),
  include_weekend_date: Joi.boolean().optional(),
  include_holiday_date: Joi.boolean().optional(),
  include_onhold_date: Joi.boolean().optional(),
  allow_stage_date_change: Joi.boolean().optional(),
  default_lead_time_for_supplier_trade: Joi.boolean().optional(),
  no_of_reminder_days: Joi.number().integer().default(7).optional().max(365),
  allow_move_next_stage_even_checklist_not_completed: Joi.boolean().optional(),
  apply_changes_all_existing_jobs: Joi.boolean().optional(),
  rebook_confrimed_bookings_on_date_changes: Joi.boolean().optional(),
  send_email_when_stage_completed: Joi.boolean().optional(),
  move_jobs_from_ready_for_construction_to_under_construction:
    Joi.boolean().optional(),
  recalculate_stage_date_construction_days_when_deleys_captured:
    Joi.boolean().optional(),
  enable_forcast_date: Joi.boolean().optional(),
  number_of_days_site_start_from_title_date: Joi.number()
    .integer()
    .default(90)
    .min(1)
    .max(365)
    .optional(),
  label_for_permit_received_date: Joi.string().trim().max(255).optional(),

  site_supervisor_roles: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "site supervisor role id must be a valid UUID",
    }),

  stage_completion_date: Joi.string()
    .trim()
    .max(50)
    .valid("claim", "move_to_next_page"),

  admin_coordinator_roles: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "admin coordinator role id must be a valid UUID",
    }),
});

export default {
  createConstructionSettingSchema,
  updateConstructionSettingSchema,
};
