import { Model, DataTypes } from "sequelize";

export class MasterPriceListCategories extends Model {
  static associate(models) {
    MasterPriceListCategories.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    MasterPriceListCategories.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    MasterPriceListCategories.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    MasterPriceListCategories.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    MasterPriceListCategories.hasMany(models.MasterPriceListCategoriesItem, { foreignKey: "master_price_list_category_id", as: "items" });
  }
}

export default (sequelize) => {
  MasterPriceListCategories.init(
    {
      master_price_list_category_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
      is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "master_price_list_categories", modelName: "MasterPriceListCategories", underscored: true },
  );
  return MasterPriceListCategories;
};
