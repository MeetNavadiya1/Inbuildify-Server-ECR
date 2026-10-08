import { Model, DataTypes } from "sequelize";

export class HLPackagePricelistItemMap extends Model {
  static associate(models) {
    HLPackagePricelistItemMap.belongsTo(models.HouseLandPackage, { foreignKey: "house_land_package_id", as: "houseLandPackage", onDelete: "CASCADE" });
    HLPackagePricelistItemMap.belongsTo(models.PriceListItem, { foreignKey: "price_list_item_id", as: "priceListItem", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  HLPackagePricelistItemMap.init(
    {
      id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      house_land_package_id: { type: DataTypes.UUID, allowNull: true },
      price_list_item_id: { type: DataTypes.UUID, allowNull: true },
      quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      total_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      note: { type: DataTypes.STRING(500), allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "h_l_package_pricelist_item_map", modelName: "HLPackagePricelistItemMap", underscored: true },
  );
  return HLPackagePricelistItemMap;
};
