import { Model, DataTypes } from "sequelize";

export class JobColorColumnSections extends Model {
  static associate(models) {
    JobColorColumnSections.belongsTo(models.JobColorSettings, { foreignKey: "job_color_settings_id", as: "jobColorSettings", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  JobColorColumnSections.init({
    job_color_column_section_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    job_color_settings_id: { type: DataTypes.UUID, allowNull: false },
    section_name: { type: DataTypes.STRING(150), allowNull: true },
    attachments: { type: DataTypes.STRING(500), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 1 },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "job_color_column_sections", modelName: "JobColorColumnSections", underscored: true });
  return JobColorColumnSections;
};
