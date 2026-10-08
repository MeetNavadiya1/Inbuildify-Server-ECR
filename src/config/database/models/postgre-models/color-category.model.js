import { Model, DataTypes } from "sequelize";

export class ColorCategory extends Model {
  static associate(models) {
    ColorCategory.belongsTo(models.Color, { foreignKey: "color_id", as: "color", onDelete: "CASCADE" });
    ColorCategory.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ColorCategory.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    ColorCategory.hasMany(models.ColorItem, { foreignKey: "color_category_id", as: "colorItems" });
    ColorCategory.hasMany(models.ColorSubCategory, { foreignKey: "color_category_id", as: "colorSubCategories" });
  }
}

export default (sequelize) => {
  ColorCategory.init(
    {
      color_category_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      color_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      category_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      selection_type: {
        type: DataTypes.STRING(100),
        defaultValue: "multiple",
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },
      status: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      suppliers: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      color_group: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
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
      tableName: "color_category",
      modelName: "ColorCategory",
      underscored: true,
    },
  );

  return ColorCategory;
};
