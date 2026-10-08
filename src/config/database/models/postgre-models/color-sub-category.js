import { Model, DataTypes } from "sequelize";

export class ColorSubCategory extends Model {
  static associate(models) {
    ColorSubCategory.belongsTo(models.ColorCategory, { foreignKey: "color_category_id", as: "colorCategory" });
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
      is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
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
