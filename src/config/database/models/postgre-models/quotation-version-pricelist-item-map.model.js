import { Model, DataTypes } from "sequelize";

export class QuotationVersionPricelistItemMap extends Model {
  static associate(models) {
    QuotationVersionPricelistItemMap.belongsTo(models.QuotationVersion, { foreignKey: "quotation_version_id", as: "quotationVersion", onDelete: "CASCADE" });
    QuotationVersionPricelistItemMap.belongsTo(models.PriceListItem, { foreignKey: "price_list_item_id", as: "priceListItem", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  QuotationVersionPricelistItemMap.init(
    {
      id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      quotation_version_id: { type: DataTypes.UUID, allowNull: true },
      price_list_item_id: { type: DataTypes.UUID, allowNull: true },
      quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      note: { type: DataTypes.STRING(500), allowNull: true },
      total_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "quotation_version_pricelist_item_map", modelName: "QuotationVersionPricelistItemMap", underscored: true },
  );
  return QuotationVersionPricelistItemMap;
};
