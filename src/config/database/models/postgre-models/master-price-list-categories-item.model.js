import { Model, DataTypes } from "sequelize";

export class MasterPriceListCategoriesItem extends Model {
  static associate(models) {
    MasterPriceListCategoriesItem.belongsTo(models.MasterPriceListCategories, { foreignKey: "master_price_list_category_id", as: "category", onDelete: "CASCADE" });
    MasterPriceListCategoriesItem.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    MasterPriceListCategoriesItem.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    MasterPriceListCategoriesItem.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    MasterPriceListCategoriesItem.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  MasterPriceListCategoriesItem.init({
    master_price_list_categories_item_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    master_price_list_category_id: { type: DataTypes.UUID, allowNull: false },
    company_id: { type: DataTypes.UUID, allowNull: false },
    builder_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    sku: { type: DataTypes.STRING(100), allowNull: true },
    short_description: { type: DataTypes.STRING(500), allowNull: true },
    full_description: { type: DataTypes.TEXT, allowNull: true },
    item_type: { type: DataTypes.STRING(100), allowNull: true },
    cost: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    cost_type: { type: DataTypes.ENUM("include", "fixed", "variable"), allowNull: false },
    cost_option: { type: DataTypes.ENUM("none", "tba", "tbc"), allowNull: false },
    currency: { type: DataTypes.STRING(10), defaultValue: "AUD" },
    uom: { type: DataTypes.STRING(50), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_standard: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_upgrade: { type: DataTypes.BOOLEAN, defaultValue: false },
    extra: { type: DataTypes.JSONB, defaultValue: {} },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "master_price_list_categories_item", modelName: "MasterPriceListCategoriesItem", underscored: true });
  return MasterPriceListCategoriesItem;
};
