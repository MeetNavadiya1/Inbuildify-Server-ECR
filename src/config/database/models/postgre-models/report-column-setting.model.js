import { Model, DataTypes } from "sequelize";

export class ReportColumnSetting extends Model {
  static associate(models) {
    ReportColumnSetting.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ReportColumnSetting.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    ReportColumnSetting.belongsTo(models.Users, { foreignKey: "user_id", as: "user", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  ReportColumnSetting.init(
    {
      report_column_setting_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      // NULL user_id = the builder-wide default saved via "Apply to all users".
      user_id: { type: DataTypes.UUID, allowNull: true },
      report_key: { type: DataTypes.STRING(60), allowNull: false },
      // Array of { key, label, visible, order, width, isCustom, customFieldId }.
      columns: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "report_column_setting", modelName: "ReportColumnSetting", underscored: true },
  );
  return ReportColumnSetting;
};
