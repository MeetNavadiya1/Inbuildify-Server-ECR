import { Model, DataTypes } from "sequelize";

export class JobColorSettings extends Model {
  static associate(models) {
    JobColorSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobColorSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobColorSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobColorSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    JobColorSettings.hasMany(models.JobColorColumnSections, { foreignKey: "job_color_settings_id", as: "columnSections" });
    JobColorSettings.hasMany(models.JobColorColumns, { foreignKey: "job_color_settings_id", as: "columns" });
  }
}

export default (sequelize) => {
  JobColorSettings.init(
    {
      job_color_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      hide_color_item_images: { type: DataTypes.BOOLEAN, defaultValue: false },
      hide_color_item_price: { type: DataTypes.BOOLEAN, defaultValue: false },
      exit_color_code: { type: DataTypes.BOOLEAN, defaultValue: false },
      page_orientation_portrait: { type: DataTypes.BOOLEAN, defaultValue: true },
      header_text: { type: DataTypes.STRING(500), allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_color_settings", modelName: "JobColorSettings", underscored: true },
  );
  return JobColorSettings;
};
