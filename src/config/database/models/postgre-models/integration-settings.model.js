import { Model, DataTypes } from "sequelize";

export class IntegrationSettings extends Model {
  static associate(models) {
    IntegrationSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    IntegrationSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    IntegrationSettings.belongsTo(models.Users, { foreignKey: "assign_leads_if_assignee_not_found", as: "fallbackAssignee", onDelete: "SET NULL" });
    IntegrationSettings.belongsTo(models.Users, { foreignKey: "always_assign_leads_to", as: "alwaysAssignTo", onDelete: "SET NULL" });
    IntegrationSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    IntegrationSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  IntegrationSettings.init(
    {
      integration_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      automatically_send_welcome_email: { type: DataTypes.BOOLEAN, defaultValue: false },
      rea_hl_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
      canibuild_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
      website_hl_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
      google_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
      assign_leads_if_assignee_not_found: { type: DataTypes.UUID, allowNull: true },
      always_assign_leads_to: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "integration_settings", modelName: "IntegrationSettings", underscored: true },
  );
  return IntegrationSettings;
};
