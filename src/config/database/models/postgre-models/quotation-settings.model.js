import { Model, DataTypes } from "sequelize";

export class QuotationSettings extends Model {
  static associate(models) {
    QuotationSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    QuotationSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    QuotationSettings.belongsTo(models.PriceList, { foreignKey: "default_pricelist_id", as: "defaultPricelist", onDelete: "SET NULL" });
    QuotationSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    QuotationSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  QuotationSettings.init(
    {
      quotation_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      allow_save_as_new_version: { type: DataTypes.BOOLEAN, defaultValue: false },
      mandatory_contact_details: { type: DataTypes.BOOLEAN, defaultValue: false },
      mandatory_dwelling_type: { type: DataTypes.BOOLEAN, defaultValue: false },
      mandatory_sketch_number: { type: DataTypes.BOOLEAN, defaultValue: false },
      mandatory_land_title: { type: DataTypes.BOOLEAN, defaultValue: false },
      enable_dwelling_size: { type: DataTypes.BOOLEAN, defaultValue: false },
      enable_builder_cost: { type: DataTypes.BOOLEAN, defaultValue: false },
      allow_notes: { type: DataTypes.BOOLEAN, defaultValue: true },
      allow_cost_adjustment: { type: DataTypes.BOOLEAN, defaultValue: true },
      show_notes_by_default: { type: DataTypes.BOOLEAN, defaultValue: true },
      allow_multiple_packages: { type: DataTypes.BOOLEAN, defaultValue: false },
      include_additional_items_in_price_adjusted_list: { type: DataTypes.BOOLEAN, defaultValue: false },
      auto_approve_on_sales_won: { type: DataTypes.BOOLEAN, defaultValue: false },
      show_default_pricelist_in_additional_items: { type: DataTypes.BOOLEAN, defaultValue: true },
      hide_price_to_customer: { type: DataTypes.BOOLEAN, defaultValue: false },
      enable_estimated_price_range: { type: DataTypes.BOOLEAN, defaultValue: false },
      quotation_validity_days: { type: DataTypes.INTEGER, defaultValue: 30 },
      extend_validity_from_updated_date: { type: DataTypes.INTEGER, defaultValue: 0 },
      rename_send_for_approval_button: { type: DataTypes.STRING(150), allowNull: true },
      default_pricelist_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "quotation_settings", modelName: "QuotationSettings", underscored: true },
  );
  return QuotationSettings;
};
