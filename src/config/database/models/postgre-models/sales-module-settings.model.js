import { Model, DataTypes } from "sequelize";

export class SalesModuleSettings extends Model {
  static associate(models) {
    SalesModuleSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    SalesModuleSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    SalesModuleSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    SalesModuleSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  SalesModuleSettings.init(
    {
      sales_module_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      allow_duplicate_leads: { type: DataTypes.BOOLEAN, defaultValue: false },
      send_email_on_new_lead: { type: DataTypes.BOOLEAN, defaultValue: true },
      show_common_folders: { type: DataTypes.BOOLEAN, defaultValue: true },
      lead_mandatory_option: { type: DataTypes.STRING(50), defaultValue: "email_and_phone" },
      role_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      sales_won_button_text: { type: DataTypes.STRING(100), defaultValue: "Mark as Won" },
      house_size_unit: { type: DataTypes.STRING(20), defaultValue: "sq_m2" },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "sales_module_settings", modelName: "SalesModuleSettings", underscored: true },
  );
  return SalesModuleSettings;
};
