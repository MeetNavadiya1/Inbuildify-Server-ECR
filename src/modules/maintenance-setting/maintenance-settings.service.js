import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/**
 * Validates that all provided role IDs exist for the given builder
 * (builder-specific or global roles where builder_id IS NULL).
 * Returns an error message string if invalid, null if all valid.
 */
async function validateSupervisorRoles(roleIds, builderId, transaction) {
  const { Role } = db;
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    return null;
  }

  const existing = await Role.findAll({
    where: {
      role_id: { [Op.in]: roleIds },
      [Op.or]: [{ builder_id: builderId }, { builder_id: null }],
    },
    attributes: ["role_id"],
    transaction,
  });

  return existing.length !== roleIds.length
    ? "One or more supervisor_roles are invalid for this builder."
    : null;
}

/**
 * Validates that all provided role IDs are active for the given builder.
 * Returns an error message string if any are inactive, null if all valid.
 */
async function validateSupervisorRolesActive(roleIds, builderId, transaction) {
  const { Role } = db;
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    return null;
  }

  const active = await Role.findAll({
    where: {
      role_id: { [Op.in]: roleIds },
      [Op.or]: [{ builder_id: builderId }, { builder_id: null }],
      is_active: true,
    },
    attributes: ["role_id"],
    transaction,
  });

  return active.length !== roleIds.length
    ? "One or more supervisor_roles are inactive."
    : null;
}

/**
 * Validates that a value is parseable as a date.
 */
function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

// ─── SERVICE: CREATE MAINTENANCE SETTINGS ────────────────────────────────────

/**
 * Creates a new MaintenanceSettings row for the builder/company.
 * Guards against duplicates, invalid supervisor roles, and invalid dates.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function createMaintenanceSettingsService({
  builderId,
  companyId,
  createdBy,
  area_enabled,
  supplier_enabled,
  allow_completion_without_supplier_response,
  request_date_enabled,
  task_date_enabled,
  repair_cost_enabled,
  hours_spent_enabled,
  maintenance_start_date,
  handover_date,
  maintenance_period_days,
  maintenance_duration_days,
  supervisor_roles,
}) {
  const { MaintenanceSettings, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Guard: supplier dependency ─────────────────────────────────────────
    if (!supplier_enabled && allow_completion_without_supplier_response) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message:
            "Cannot allow completion without supplier response when supplier is disabled.",
        },
      };
    }

    // ── Validate supervisor roles (existence then active status) ───────────
    const roleExistError = await validateSupervisorRoles(supervisor_roles, builderId, transaction);
    if (roleExistError) {
      await transaction.rollback();
      return { error: { status: 400, message: roleExistError } };
    }

    const roleActiveError = await validateSupervisorRolesActive(supervisor_roles, builderId, transaction);
    if (roleActiveError) {
      await transaction.rollback();
      return { error: { status: 400, message: roleActiveError } };
    }

    // ── Duplicate check ────────────────────────────────────────────────────
    const duplicate = await MaintenanceSettings.findOne({
      where: { company_id: companyId, builder_id: builderId },
      transaction,
    });

    if (duplicate) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "Maintenance settings already exist for this company and builder.",
        },
      };
    }

    // ── Date validation ────────────────────────────────────────────────────
    if (maintenance_start_date && !isValidDate(maintenance_start_date)) {
      await transaction.rollback();
      return { error: { status: 400, message: `Invalid date: ${maintenance_start_date}` } };
    }

    if (handover_date && !isValidDate(handover_date)) {
      await transaction.rollback();
      return { error: { status: 400, message: `Invalid date: ${handover_date}` } };
    }

    // ── Insert ─────────────────────────────────────────────────────────────
    const created = await MaintenanceSettings.create(
      {
        company_id: companyId,
        builder_id: builderId,
        area_enabled: area_enabled ?? false,
        supplier_enabled: supplier_enabled ?? false,
        allow_completion_without_supplier_response:
          allow_completion_without_supplier_response ?? false,
        request_date_enabled: request_date_enabled ?? false,
        task_date_enabled: task_date_enabled ?? false,
        repair_cost_enabled: repair_cost_enabled ?? false,
        hours_spent_enabled: hours_spent_enabled ?? false,
        maintenance_start_date,
        handover_date,
        maintenance_period_days,
        maintenance_duration_days,
        supervisor_roles,
        created_by: createdBy,
        updated_by: createdBy,
      },
      { transaction },
    );

    await transaction.commit();

    return { data: keysToCamelCase(created.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: UPDATE MAINTENANCE SETTINGS ────────────────────────────────────

/**
 * Partially updates MaintenanceSettings for the builder/company.
 * Enforces supplier/completion_without_supplier_response consistency,
 * validates supervisor roles, and auto-resolves finalAllowCompletion.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function updateMaintenanceSettingsService({
  builderId,
  companyId,
  userId,
  area_enabled,
  supplier_enabled,
  allow_completion_without_supplier_response,
  request_date_enabled,
  task_date_enabled,
  repair_cost_enabled,
  hours_spent_enabled,
  maintenance_start_date,
  maintenance_period_days,
  maintenance_duration_days,
  supervisor_roles,
}) {
  const { MaintenanceSettings, Role, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const record = await MaintenanceSettings.findOne({
      where: { builder_id: builderId, company_id: companyId },
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return { error: { status: 404, message: "Maintenance settings not found." } };
    }

    // ── Guard: maintenance_start_date enum validation ──────────────────────
    if (
      maintenance_start_date !== undefined &&
      !["handover_date", "occupancy_permit_date"].includes(maintenance_start_date)
    ) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "maintenance_start_date must be 'handover_date' or 'occupancy_permit_date'.",
        },
      };
    }

    // ── Effective supplier state after this update ─────────────────────────
    // Use the incoming value when provided, otherwise fall back to the stored
    // value. Guarding on the persisted value alone wrongly rejects turning
    // supplier ON and allow_completion ON in the same request.
    const effectiveSupplierEnabled =
      supplier_enabled !== undefined ? supplier_enabled : record.supplier_enabled;

    // ── Guard: allow_completion cannot be true while supplier is disabled ──
    if (
      effectiveSupplierEnabled === false &&
      allow_completion_without_supplier_response === true
    ) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message:
            "Cannot allow completion without supplier response when supplier is disabled.",
        },
      };
    }

    // ── Guard: at least one field required ─────────────────────────────────
    const hasFields = [
      area_enabled,
      supplier_enabled,
      allow_completion_without_supplier_response,
      request_date_enabled,
      task_date_enabled,
      repair_cost_enabled,
      hours_spent_enabled,
      maintenance_start_date,
      maintenance_period_days,
      maintenance_duration_days,
      supervisor_roles,
    ].some((v) => v !== undefined);

    if (!hasFields) {
      await transaction.rollback();
      return { error: { status: 400, message: "No fields provided to update." } };
    }

    // ── Validate supervisor roles ──────────────────────────────────────────
    if (Array.isArray(supervisor_roles) && supervisor_roles.length > 0) {
      const existing = await Role.findAll({
        where: { role_id: { [Op.in]: supervisor_roles } },
        attributes: ["role_id"],
        transaction,
      });

      if (existing.length !== supervisor_roles.length) {
        await transaction.rollback();
        return { error: { status: 400, message: "One or more supervisor_roles are invalid." } };
      }
    }

    // ── Resolve final allow_completion value ───────────────────────────────
    // If supplier ends up disabled, force allow_completion off to keep the
    // invariant (supplier off ⇒ allow_completion off).
    let finalAllowCompletion = allow_completion_without_supplier_response;
    if (effectiveSupplierEnabled === false) {
      finalAllowCompletion = false;
    }

    // ── Build update payload ───────────────────────────────────────────────
    const updatePayload = {
      ...(area_enabled !== undefined && { area_enabled }),
      ...(supplier_enabled !== undefined && { supplier_enabled }),
      ...(finalAllowCompletion !== undefined && {
        allow_completion_without_supplier_response: finalAllowCompletion,
      }),
      ...(request_date_enabled !== undefined && { request_date_enabled }),
      ...(task_date_enabled !== undefined && { task_date_enabled }),
      ...(repair_cost_enabled !== undefined && { repair_cost_enabled }),
      ...(hours_spent_enabled !== undefined && { hours_spent_enabled }),
      ...(maintenance_start_date !== undefined && { maintenance_start_date }),
      ...(maintenance_period_days !== undefined && { maintenance_period_days }),
      ...(maintenance_duration_days !== undefined && { maintenance_duration_days }),
      ...(supervisor_roles !== undefined && { supervisor_roles }),
      updated_by: userId,
    };

    await record.update(updatePayload, { transaction });

    await transaction.commit();

    return { data: keysToCamelCase(record.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: GET USER MAINTENANCE SETTINGS ──────────────────────────────────

/**
 * Fetches MaintenanceSettings for the builder/company.
 * Auto-creates a default row with all DB defaults if none exists.
 *
 * @returns {{ data: object }}
 */
export async function getUserMaintenanceSettingsService({
  builderId,
  companyId,
  userId,
}) {
  const { MaintenanceSettings, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    let record = await MaintenanceSettings.findOne({
      where: { company_id: companyId, builder_id: builderId },
      transaction,
    });

    if (!record) {
      record = await MaintenanceSettings.create(
        {
          company_id: companyId,
          builder_id: builderId,
          created_by: userId,
          updated_by: userId,
        },
        { transaction },
      );
    }

    await transaction.commit();

    return { data: keysToCamelCase(record.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
