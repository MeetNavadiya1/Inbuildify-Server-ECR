import { Model, DataTypes } from "sequelize";

export class JobColorColumns extends Model {
  static associate(models) {
    JobColorColumns.belongsTo(models.JobColorSettings, { foreignKey: "job_color_settings_id", as: "jobColorSettings", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  JobColorColumns.init({
    job_color_column_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    job_color_settings_id: { type: DataTypes.UUID, allowNull: false },
    column_name: { type: DataTypes.STRING(150), allowNull: false },
    display_option: { type: DataTypes.STRING(50), allowNull: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: true },
    width: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "job_color_columns", modelName: "JobColorColumns", underscored: true });
  return JobColorColumns;
};
