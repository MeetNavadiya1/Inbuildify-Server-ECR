import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default recalculate_date for a new builder
 */
export async function seedRecalculateDate({ company_id, builder_id, created_by, transaction }) {
  const { RecalculateDate } = db;

  await RecalculateDate.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      recalculate_workflow_job_estimated_dates: false,
      recalculate_construction_job_estimated_dates: false,
      capture_reason_rebooking_and_rebooking_email: false,
      capture_text: null,
      recalculate_confirmed_booking_dates: false,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedRecalculateDate };
