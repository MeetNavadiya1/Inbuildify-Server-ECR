import { Model, DataTypes } from "sequelize";

export class FloorPlanPricelistItemMap extends Model {
  static associate(models) {
    FloorPlanPricelistItemMap.belongsTo(models.FloorPlan, { foreignKey: "floor_plan_id", as: "floorPlan", onDelete: "CASCADE" });
    FloorPlanPricelistItemMap.belongsTo(models.PriceListItem, { foreignKey: "price_list_item_id", as: "priceListItem", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  FloorPlanPricelistItemMap.init(
    {
      id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      floor_plan_id: { type: DataTypes.UUID, allowNull: true },
      price_list_item_id: { type: DataTypes.UUID, allowNull: true },
      include_default: { type: DataTypes.BOOLEAN, defaultValue: false },
      modify: { type: DataTypes.BOOLEAN, defaultValue: false },
      quantity: { type: DataTypes.INTEGER, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "floor_plan_pricelist_item_map", modelName: "FloorPlanPricelistItemMap", underscored: true },
  );
  return FloorPlanPricelistItemMap;
};
