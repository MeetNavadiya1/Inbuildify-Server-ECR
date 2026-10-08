import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default maintenance_settings for a new builder
 */
export async function seedMaintenanceSettings({ company_id, builder_id, created_by, transaction }) {
  const { MaintenanceSettings } = db;

  await MaintenanceSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      area_enabled: false,
      supplier_enabled: false,
      allow_completion_without_supplier_response: false,
      request_date_enabled: false,
      task_date_enabled: false,
      repair_cost_enabled: false,
      hours_spent_enabled: false,
      maintenance_start_date: "handover_date",
      maintenance_period_days: 0,
      maintenance_duration_days: 0,
      supervisor_roles: [],
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedMaintenanceSettings };
