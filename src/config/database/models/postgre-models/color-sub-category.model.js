import { Model, DataTypes } from "sequelize";

export class ColorSubCategory extends Model {
  static associate(models) {
    ColorSubCategory.belongsTo(models.ColorCategory, { foreignKey: "color_category_id", as: "colorCategory" });
    ColorSubCategory.belongsTo(models.Users, { foreignKey: "created_by_id", as: "createdByUser" });
    ColorSubCategory.belongsTo(models.Users, { foreignKey: "updated_by_id", as: "updatedByUser" });
  }
}

export default (sequelize) => {
  ColorSubCategory.init(
    {
      color_sub_category_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      color_category_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updated_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: "color_sub_category",
      modelName: "ColorSubCategory",
      underscored: true,
    },
  );
  return ColorSubCategory;
};
