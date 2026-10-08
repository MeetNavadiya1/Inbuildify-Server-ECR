
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getConstructionSettingsService,
  updateConstructionSettingsService,
} from "./construction-setting.service.js";

export async function getConstructionSettings(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;

  try {
    if (!builderId) {
      return errorResponse(res, 400, "Builder ID not found in user context.");
    }

    if (!companyId) {
      return errorResponse(res, 400, "Company ID not found.");
    }

    const { data, created } = await getConstructionSettingsService({ builderId, companyId, userId });

    return successResponse(
      res,
      keysToCamelCase(data),
      created
        ? "Construction settings created and retrieved successfully."
        : "Construction settings retrieved successfully.",
    );
  } catch (error) {
    console.error("Error fetching construction settings:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateConstructionSettings(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;

  const {
    suppliers_tradies_madatory_to_complete_checklist,
    allow_checklist_even_supplier_tradies_not_responded,
    show_warning_when_supplier_trade_booked_same_day_for_checklist,
    sending_email_private_inspector_mandatory,
    make_inspection_chacklist_mandatory,
    include_weekend_date,
    include_holiday_date,
    include_onhold_date,
    allow_stage_date_change,
    default_lead_time_for_supplier_trade,
    no_of_reminder_days,
    allow_move_next_stage_even_checklist_not_completed,
    apply_changes_all_existing_jobs,
    rebook_confrimed_bookings_on_date_changes,
    send_email_when_stage_completed,
    move_jobs_from_ready_for_construction_to_under_construction,
    recalculate_stage_date_construction_days_when_deleys_captured,
    enable_forcast_date,
    number_of_days_site_start_from_title_date,
    label_for_permit_received_date,
    site_supervisor_roles = [],
    stage_completion_date,
    admin_coordinator_roles = [],
  } = req.body;

  try {
    if (!builderId) {
      return errorResponse(res, 400, "Builder ID not found in user context.");
    }

    if (!companyId) {
      return errorResponse(res, 400, "Company ID not found.");
    }

    const result = await updateConstructionSettingsService({
      builderId,
      companyId,
      userId,
      suppliers_tradies_madatory_to_complete_checklist,
      allow_checklist_even_supplier_tradies_not_responded,
      show_warning_when_supplier_trade_booked_same_day_for_checklist,
      sending_email_private_inspector_mandatory,
      make_inspection_chacklist_mandatory,
      include_weekend_date,
      include_holiday_date,
      include_onhold_date,
      allow_stage_date_change,
      default_lead_time_for_supplier_trade,
      no_of_reminder_days,
      allow_move_next_stage_even_checklist_not_completed,
      apply_changes_all_existing_jobs,
      rebook_confrimed_bookings_on_date_changes,
      send_email_when_stage_completed,
      move_jobs_from_ready_for_construction_to_under_construction,
      recalculate_stage_date_construction_days_when_deleys_captured,
      enable_forcast_date,
      number_of_days_site_start_from_title_date,
      label_for_permit_received_date,
      site_supervisor_roles,
      stage_completion_date,
      admin_coordinator_roles,
      body: req.body,
    });

    return successResponse(res, keysToCamelCase(result), "Construction settings updated successfully.");
  } catch (error) {
    console.error("Error updating construction settings:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
