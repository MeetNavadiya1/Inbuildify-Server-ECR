import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default construction_settings for a new builder
 */
export async function seedConstructionSettings({ company_id, builder_id, created_by, transaction }) {
  const { ConstructionSettings } = db;

  await ConstructionSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      suppliers_tradies_madatory_to_complete_checklist: false,
      allow_checklist_even_supplier_tradies_not_responded: false,
      show_warning_when_supplier_trade_booked_same_day_for_checklist: false,
      sending_email_private_inspector_mandatory: false,
      make_inspection_chacklist_mandatory: false,
      include_weekend_date: false,
      include_holiday_date: false,
      include_onhold_date: false,
      allow_stage_date_change: false,
      default_lead_time_for_supplier_trade: false,
      no_of_reminder_days: 7,
      allow_move_next_stage_even_checklist_not_completed: false,
      apply_changes_all_existing_jobs: false,
      rebook_confrimed_bookings_on_date_changes: false,
      send_email_when_stage_completed: false,
      move_jobs_from_ready_for_construction_to_under_construction: false,
      recalculate_stage_date_construction_days_when_deleys_captured: false,
      enable_forcast_date: false,
      number_of_days_site_start_from_title_date: 90,
      label_for_permit_received_date: null,
      site_supervisor_roles: [],
      stage_completion_date: "claim",
      admin_coordinator_roles: [],
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedConstructionSettings };
