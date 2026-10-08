import { Model, DataTypes } from "sequelize";

export class PriceListItemCondition extends Model {
  static associate(models) {
    PriceListItemCondition.belongsTo(models.PriceListItem, { foreignKey: "price_list_item_id", as: "priceListItem", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  PriceListItemCondition.init({
    price_list_item_condition_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    price_list_item_id: { type: DataTypes.UUID, allowNull: false },
    condition_name: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.BOOLEAN, defaultValue: true },
    range_start: { type: DataTypes.DOUBLE, allowNull: true },
    range_end: { type: DataTypes.DOUBLE, allowNull: true },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "price_list_item_condition", modelName: "PriceListItemCondition", underscored: true });
  return PriceListItemCondition;
};
