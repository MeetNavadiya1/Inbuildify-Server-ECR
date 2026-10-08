import Joi from "joi";

export const updateRecalculateDateSchema = Joi.object({
  recalculate_workflow_job_estimated_dates: Joi.boolean().optional(),
  recalculate_construction_job_estimated_dates: Joi.boolean().optional(),
  capture_reason_rebooking_and_rebooking_email: Joi.boolean().optional(),
  capture_text: Joi.string()
    .trim()
    .max(500)
    .pattern(/^[^<>]*$/)
    .optional(),
  recalculate_confirmed_booking_dates: Joi.boolean().optional(),
});

export default {
  updateRecalculateDateSchema,
};
