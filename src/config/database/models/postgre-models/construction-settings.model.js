import { Model, DataTypes } from "sequelize";

export class ConstructionSettings extends Model {
  static associate(models) {
    ConstructionSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ConstructionSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    ConstructionSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ConstructionSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  ConstructionSettings.init({
    construction_setting_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    suppliers_tradies_madatory_to_complete_checklist: { type: DataTypes.BOOLEAN, defaultValue: false },
    allow_checklist_even_supplier_tradies_not_responded: { type: DataTypes.BOOLEAN, defaultValue: false },
    show_warning_when_supplier_trade_booked_same_day_for_checklist: { type: DataTypes.BOOLEAN, defaultValue: false },
    sending_email_private_inspector_mandatory: { type: DataTypes.BOOLEAN, defaultValue: false },
    make_inspection_chacklist_mandatory: { type: DataTypes.BOOLEAN, defaultValue: false },
    include_weekend_date: { type: DataTypes.BOOLEAN, defaultValue: false },
    include_holiday_date: { type: DataTypes.BOOLEAN, defaultValue: false },
    include_onhold_date: { type: DataTypes.BOOLEAN, defaultValue: false },
    allow_stage_date_change: { type: DataTypes.BOOLEAN, defaultValue: false },
    default_lead_time_for_supplier_trade: { type: DataTypes.BOOLEAN, defaultValue: false },
    no_of_reminder_days: { type: DataTypes.INTEGER, defaultValue: 7 },
    allow_move_next_stage_even_checklist_not_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
    apply_changes_all_existing_jobs: { type: DataTypes.BOOLEAN, defaultValue: false },
    rebook_confrimed_bookings_on_date_changes: { type: DataTypes.BOOLEAN, defaultValue: false },
    send_email_when_stage_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
    move_jobs_from_ready_for_construction_to_under_construction: { type: DataTypes.BOOLEAN, defaultValue: false },
    recalculate_stage_date_construction_days_when_deleys_captured: { type: DataTypes.BOOLEAN, defaultValue: false },
    enable_forcast_date: { type: DataTypes.BOOLEAN, defaultValue: false },
    number_of_days_site_start_from_title_date: { type: DataTypes.INTEGER, defaultValue: 90 },
    label_for_permit_received_date: { type: DataTypes.STRING(150), allowNull: true },
    site_supervisor_roles: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
    stage_completion_date: { type: DataTypes.STRING(50), defaultValue: "claim" },
    admin_coordinator_roles: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "construction_settings", modelName: "ConstructionSettings", underscored: true });
  return ConstructionSettings;
};
