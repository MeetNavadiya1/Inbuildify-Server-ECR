import { Model, DataTypes } from "sequelize";

export class JobSettings extends Model {
  static associate(models) {
    JobSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobSettings.init(
    {
      job_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      auto_move_to_maintenance: { type: DataTypes.BOOLEAN, defaultValue: false },
      auto_mark_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
      auto_archive_after_completion: { type: DataTypes.BOOLEAN, defaultValue: false },
      auto_archive_after_days: { type: DataTypes.INTEGER, allowNull: true },
      milestone_status_check_days: { type: DataTypes.INTEGER, allowNull: true },
      report_custom_days: { type: DataTypes.INTEGER, allowNull: true },
      report_status_filter: { type: DataTypes.STRING(100), defaultValue: "all" },
      report_include_date: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_settings", modelName: "JobSettings", underscored: true },
  );
  return JobSettings;
};
