import { Model, DataTypes } from "sequelize";

export class PackagePricelistItemMap extends Model {
  static associate(models) {
    PackagePricelistItemMap.belongsTo(models.Package, { foreignKey: "package_id", as: "package", onDelete: "CASCADE" });
    PackagePricelistItemMap.belongsTo(models.PriceListItem, { foreignKey: "price_list_item_id", as: "priceListItem", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  PackagePricelistItemMap.init({
    id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    package_id: { type: DataTypes.UUID, allowNull: false },
    price_list_item_id: { type: DataTypes.UUID, allowNull: false },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
  }, { sequelize, tableName: "package_pricelist_item_map", modelName: "PackagePricelistItemMap", underscored: true, timestamps: false });
  return PackagePricelistItemMap;
};
