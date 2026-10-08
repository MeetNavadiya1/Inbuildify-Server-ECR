import { Model, DataTypes } from "sequelize";

export class JobColor extends Model {
  static associate(models) {
    JobColor.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobColor.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobColor.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobColor.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobColor.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    JobColor.hasMany(models.JobColorCategory, { foreignKey: "color_id", as: "colorCategories" });
  }
}

export default (sequelize) => {
  JobColor.init(
    {
      color_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      template_color_id: { type: DataTypes.UUID, allowNull: true },
      job_id: { type: DataTypes.UUID, allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      color_name: { type: DataTypes.STRING(255), allowNull: false },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 1 },
      status: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: "job_color", modelName: "JobColor", underscored: true },
  );
  return JobColor;
};
