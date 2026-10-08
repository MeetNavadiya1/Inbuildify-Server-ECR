import { Model, DataTypes } from "sequelize";

export class JobWorkflowSettings extends Model {
  static associate(models) {
    JobWorkflowSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobWorkflowSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobWorkflowSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobWorkflowSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobWorkflowSettings.init(
    {
      job_workflow_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      show_all_tasks_to_all_roles: { type: DataTypes.BOOLEAN, defaultValue: false },
      include_weekend_date: { type: DataTypes.BOOLEAN, defaultValue: false },
      include_holiday_date: { type: DataTypes.BOOLEAN, defaultValue: false },
      recalculate_estimated_end_dates_future_tasks: { type: DataTypes.BOOLEAN, defaultValue: false },
      recalculate_estimated_dates_based_on_actual_changes: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_workflow_settings", modelName: "JobWorkflowSettings", underscored: true },
  );
  return JobWorkflowSettings;
};
