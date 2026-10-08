import { Model, DataTypes } from "sequelize";

export class QuotationVersionItem extends Model {
  static associate(models) {
    QuotationVersionItem.belongsTo(models.QuotationVersion, { foreignKey: "quotation_version_id", as: "quotationVersion", onDelete: "CASCADE" });
    QuotationVersionItem.belongsTo(models.PriceListItem, { foreignKey: "price_list_item_id", as: "priceListItem", onDelete: "SET NULL" });
    QuotationVersionItem.belongsTo(models.Package, { foreignKey: "package_id", as: "package", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  QuotationVersionItem.init(
    {
      quotation_version_item_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      quotation_version_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      price_list_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      price_list_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      price_list_item_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      price_list_item_description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      price_list_item_short_description: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      price_list_item_cost_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      price_list_item_cost_type_text: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      price_list_item_cost_option: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      price_list_item_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      price_list_item_builder_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      price_list_item_sort_order: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      price_list_item_uom: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      price_list_item_status: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      price_list_item_include_by_default: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      price_list_item_allow_remove_from_quotation: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      price_list_item_show_in_hl_package: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      price_list_item_package_only: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      price_list_item_range_id: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      price_list_item_dwelling_type_id: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      price_list_item_created_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      price_list_item_updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      package_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      package_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      package_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      package_builder_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      quantity: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      note: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      total_price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      extra_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      extra_item: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      price_list_item_is_system_data: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: {
        type: DataTypes.DATE,
        field: "created_at",
      },
      updatedAt: {
        type: DataTypes.DATE,
        field: "updated_at",
      },
    },
    {
      sequelize,
      tableName: "quotation_version_items",
      modelName: "QuotationVersionItem",
      underscored: true,
    },
  );
  return QuotationVersionItem;
};
