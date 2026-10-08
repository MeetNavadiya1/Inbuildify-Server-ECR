import { Model, DataTypes } from "sequelize";

export class Categories extends Model {
  static associate(models) {
    Categories.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder" });
    Categories.belongsTo(models.AdminCategory, { foreignKey: "admin_category_id", as: "adminCategory" });
  }
}

export default (sequelize) => {
  Categories.init(
    {
      category_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      builder_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      admin_category_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      display_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "categories",
      modelName: "Categories",
      underscored: true,
    },
  );

  return Categories;
};
