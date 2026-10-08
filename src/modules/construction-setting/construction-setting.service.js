import db from "../../config/database/models/postgre-models/index.js";

export async function getConstructionSettingsService({ builderId, companyId, userId }) {
  // ── 1. Find existing construction settings ────────────────────────────────
  const existing = await db.ConstructionSettings.findOne({
    where: {
      builder_id: builderId,
      company_id: companyId,
    },
  });

  if (existing) {
    return { data: existing.toJSON(), created: false };
  }

  // ── 2. Auto-create with defaults if not found ─────────────────────────────
  const created = await db.ConstructionSettings.create({
    builder_id: builderId,
    company_id: companyId,
    created_by: userId,
    updated_by: userId,
  });

  return { data: created.toJSON(), created: true };
}

export async function updateConstructionSettingsService({
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
  body,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check existing settings ────────────────────────────────────────────
    const existing = await db.ConstructionSettings.findOne({
      where: { company_id: companyId, builder_id: builderId },
      transaction,
    });

    if (!existing) {
      const error = new Error("No construction settings found to update for this company and builder.");
      error.status = 404;
      throw error;
    }

    const old = existing.toJSON();
    const updatePayload = {};

    // ── 2. Business logic: suppliers checklist + allow checklist dependency ───
    if (suppliers_tradies_madatory_to_complete_checklist !== undefined) {
      if (suppliers_tradies_madatory_to_complete_checklist === false) {
        if (allow_checklist_even_supplier_tradies_not_responded === true) {
          const error = new Error("Cannot define allow_checklist_even_supplier_tradies_not_responded when checklist mandatory is false.");
          error.status = 400;
          throw error;
        }
        updatePayload.suppliers_tradies_madatory_to_complete_checklist = false;
        updatePayload.allow_checklist_even_supplier_tradies_not_responded = false;
      } else {
        updatePayload.suppliers_tradies_madatory_to_complete_checklist = suppliers_tradies_madatory_to_complete_checklist;
        updatePayload.allow_checklist_even_supplier_tradies_not_responded =
                    allow_checklist_even_supplier_tradies_not_responded !== undefined
                      ? allow_checklist_even_supplier_tradies_not_responded
                      : old.allow_checklist_even_supplier_tradies_not_responded;
      }
    } else if (allow_checklist_even_supplier_tradies_not_responded !== undefined) {
      if (old.suppliers_tradies_madatory_to_complete_checklist === false) {
        const error = new Error("Cannot define allow_checklist_even_supplier_tradies_not_responded when checklist mandatory is false.");
        error.status = 400;
        throw error;
      }
      updatePayload.allow_checklist_even_supplier_tradies_not_responded = allow_checklist_even_supplier_tradies_not_responded;
    }

    // ── 3. Business logic: default lead time + reminder days dependency ───────
    if (default_lead_time_for_supplier_trade !== undefined) {
      if (default_lead_time_for_supplier_trade === false) {
        if (no_of_reminder_days !== undefined && no_of_reminder_days !== null) {
          const error = new Error("Reminder days cannot be defined when default lead time is disabled.");
          error.status = 400;
          throw error;
        }
        updatePayload.default_lead_time_for_supplier_trade = false;
        updatePayload.no_of_reminder_days = null;
      } else {
        updatePayload.default_lead_time_for_supplier_trade = default_lead_time_for_supplier_trade;
        updatePayload.no_of_reminder_days =
                    no_of_reminder_days !== undefined && no_of_reminder_days !== null
                      ? no_of_reminder_days
                      : 7;
      }
    } else if (no_of_reminder_days !== undefined) {
      if (old.default_lead_time_for_supplier_trade === false) {
        const error = new Error("Reminder days cannot be defined when default lead time is disabled.");
        error.status = 400;
        throw error;
      }
      updatePayload.no_of_reminder_days = no_of_reminder_days;
    }

    // ── 4. Other simple fields ────────────────────────────────────────────────
    const otherFields = [
      "show_warning_when_supplier_trade_booked_same_day_for_checklist",
      "sending_email_private_inspector_mandatory",
      "make_inspection_chacklist_mandatory",
      "include_weekend_date",
      "include_holiday_date",
      "include_onhold_date",
      "allow_stage_date_change",
      "allow_move_next_stage_even_checklist_not_completed",
      "apply_changes_all_existing_jobs",
      "rebook_confrimed_bookings_on_date_changes",
      "send_email_when_stage_completed",
      "move_jobs_from_ready_for_construction_to_under_construction",
      "recalculate_stage_date_construction_days_when_deleys_captured",
      "enable_forcast_date",
      "number_of_days_site_start_from_title_date",
      "label_for_permit_received_date",
      "stage_completion_date",
    ];

    otherFields.forEach((field) => {
      if (body[field] !== undefined) {
        updatePayload[field] = body[field];
      }
    });

    // ── 5. Validate and add admin_coordinator_roles ───────────────────────────
    if (admin_coordinator_roles.length > 0) {
      const adminRoles = await db.Role.findAll({
        where: { role_id: { [db.Sequelize.Op.in]: admin_coordinator_roles } },
        attributes: ["role_id"],
        transaction,
      });

      if (adminRoles.length !== admin_coordinator_roles.length) {
        const error = new Error("Invalid admin coordinator roles");
        error.status = 400;
        throw error;
      }

      updatePayload.admin_coordinator_roles = admin_coordinator_roles;
    }

    // ── 6. Validate and add site_supervisor_roles ─────────────────────────────
    if (site_supervisor_roles.length > 0) {
      const supervisorRoles = await db.Role.findAll({
        where: { role_id: { [db.Sequelize.Op.in]: site_supervisor_roles } },
        attributes: ["role_id"],
        transaction,
      });

      if (supervisorRoles.length !== site_supervisor_roles.length) {
        const error = new Error("Invalid site supervisor roles");
        error.status = 400;
        throw error;
      }

      updatePayload.site_supervisor_roles = site_supervisor_roles;
    }

    // ── 7. Guard: nothing to update ───────────────────────────────────────────
    if (Object.keys(updatePayload).length === 0) {
      const error = new Error("No fields provided to update.");
      error.status = 400;
      throw error;
    }

    updatePayload.updated_by = userId;

    // ── 8. Perform update ─────────────────────────────────────────────────────
    await existing.update(updatePayload, { transaction });

    await transaction.commit();

    return existing.toJSON();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
