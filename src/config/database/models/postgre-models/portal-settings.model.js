import { Model, DataTypes } from "sequelize";

export class PortalSettings extends Model {
  static associate(models) {
    PortalSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    PortalSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    PortalSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    PortalSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  PortalSettings.init(
    {
      portal_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      send_login_credentials_to_customer: { type: DataTypes.BOOLEAN, defaultValue: false },
      portal_active_days_after_handover: { type: DataTypes.INTEGER, allowNull: true },
      send_mail_when_portal_inactive: { type: DataTypes.BOOLEAN, defaultValue: false },
      show_site_supervisor_details: { type: DataTypes.BOOLEAN, defaultValue: false },
      show_balance_to_pay: { type: DataTypes.BOOLEAN, defaultValue: false },
      add_notes_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
      allow_color_selection: { type: DataTypes.BOOLEAN, defaultValue: false },
      show_color_cost: { type: DataTypes.BOOLEAN, defaultValue: false },
      show_construction_stages: { type: DataTypes.BOOLEAN, defaultValue: false },
      auto_share_site_images: { type: DataTypes.BOOLEAN, defaultValue: false },
      show_progress_tab: { type: DataTypes.BOOLEAN, defaultValue: false },
      default_facade_image: { type: DataTypes.STRING(500), allowNull: true },
      publish_packages_to_agent_portal: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "portal_settings", modelName: "PortalSettings", underscored: true },
  );
  return PortalSettings;
};
