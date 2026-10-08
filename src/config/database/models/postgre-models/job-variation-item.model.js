import { Model, DataTypes } from "sequelize";

export class JobVariationItem extends Model {
  static associate(models) {
    JobVariationItem.belongsTo(models.JobVariation, { foreignKey: "variation_id", as: "jobVariation", onDelete: "CASCADE" });
    JobVariationItem.belongsTo(models.PriceListItem, { foreignKey: "price_list_item_id", as: "priceListItem", onDelete: "SET NULL" });
    JobVariationItem.belongsTo(models.PriceList, { foreignKey: "price_list_id", as: "priceList", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobVariationItem.init(
    {
      job_variation_item_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      variation_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      price_list_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      price_list_item_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      additional: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      site_cost: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      cost: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      drawing_changes: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // True for colour / price-master items (vs manually-added extras); gates
      // whether the item shows in the PDF when show_price_master_in_pdf is off.
      is_price_master: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_removed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      quantity: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      total: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      item_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      uom: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      range_id: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      dwelling_type_id: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
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
      tableName: "job_variation_item",
      modelName: "JobVariationItem",
      underscored: true,
    },
  );
  return JobVariationItem;
};
