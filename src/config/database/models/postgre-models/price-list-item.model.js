import { Model, DataTypes } from "sequelize";

export class PriceListItem extends Model {
  static associate(models) {
    PriceListItem.belongsTo(models.PriceList, { foreignKey: "price_list_id", as: "priceList", onDelete: "CASCADE" });
    PriceListItem.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    PriceListItem.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    PriceListItem.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    PriceListItem.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    PriceListItem.hasMany(models.PriceListItemCondition, { foreignKey: "price_list_item_id", as: "conditions" });
  }
}

export default (sequelize) => {
  PriceListItem.init(
    {
      price_list_item_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      price_list_id: { type: DataTypes.UUID, allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      item_description: { type: DataTypes.TEXT, allowNull: false },
      short_description: { type: DataTypes.STRING(500), allowNull: true },
      cost_type: { type: DataTypes.STRING(50), allowNull: false },
      cost_type_text: { type: DataTypes.STRING(255), allowNull: true },
      cost_option: { type: DataTypes.STRING(50), defaultValue: "none" },
      cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      builder_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
      is_system_data: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      uom: { type: DataTypes.STRING(50), allowNull: true },
      status: { type: DataTypes.STRING(20), defaultValue: "active" },
      include_by_default: { type: DataTypes.BOOLEAN, defaultValue: false },
      allow_remove_from_quotation: { type: DataTypes.BOOLEAN, defaultValue: false },
      show_in_hl_package: { type: DataTypes.BOOLEAN, defaultValue: false },
      show_only_in_package: { type: DataTypes.BOOLEAN, defaultValue: false },
      range_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      dwelling_type_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      additional_item: { type: DataTypes.BOOLEAN, defaultValue: false },
      // Set only on rows the sample-data importer created, so Settings →
      // Sample Data can purge them without touching the builder's own catalog.
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "price_list_item", modelName: "PriceListItem", underscored: true },
  );
  return PriceListItem;
};
