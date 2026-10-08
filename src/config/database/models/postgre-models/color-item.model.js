import { Model, DataTypes } from "sequelize";

export class ColorItem extends Model {
  static associate(models) {
    ColorItem.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ColorItem.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    ColorItem.belongsTo(models.ColorCategory, { foreignKey: "color_category_id", as: "colorCategory", onDelete: "CASCADE" });
    ColorItem.belongsTo(models.Supplier, { foreignKey: "supplier_id", as: "supplier", onDelete: "SET NULL" });
    ColorItem.hasMany(models.ColorGroupItemMap, { foreignKey: "color_item_id", as: "colorGroupItemMaps" });
    ColorItem.hasMany(models.ColorItemCustomField, { foreignKey: "color_item", as: "customFields" });
    ColorItem.belongsTo(models.Color,{foreignKey:"color_id",as:"color",onDelete:"SET NULL"});
  }
}

export default (sequelize) => {
  ColorItem.init(
    {
      color_item_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      color_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      builder_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      color_category_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      color_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      item_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      item_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      supplier_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      upgrade_option: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      cost_type: {
        type: DataTypes.STRING(50),
        defaultValue: "standard",
      },
      cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      features: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      specification_name: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      color_type_id: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      range_id: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      units: {
        type: DataTypes.STRING(50),
        defaultValue: "non_mandatory",
      },
      color_image: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
      specification: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
      status: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "color_item",
      modelName: "ColorItem",
      underscored: true,
    },
  );

  return ColorItem;
};
