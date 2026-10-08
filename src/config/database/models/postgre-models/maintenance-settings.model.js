import { Model, DataTypes } from "sequelize";

export class MaintenanceSettings extends Model {
  static associate(models) {
    MaintenanceSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    MaintenanceSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    MaintenanceSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    MaintenanceSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  MaintenanceSettings.init({
    maintenance_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    area_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    supplier_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    allow_completion_without_supplier_response: { type: DataTypes.BOOLEAN, defaultValue: false },
    request_date_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    task_date_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    repair_cost_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    hours_spent_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    maintenance_start_date: { type: DataTypes.STRING(50), defaultValue: "handover_date" },
    maintenance_period_days: { type: DataTypes.INTEGER, allowNull: true },
    maintenance_duration_days: { type: DataTypes.INTEGER, allowNull: true },
    supervisor_roles: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "maintenance_settings", modelName: "MaintenanceSettings", underscored: true });
  return MaintenanceSettings;
};
