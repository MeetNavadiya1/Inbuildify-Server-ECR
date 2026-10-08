import { Model, DataTypes } from "sequelize";

export class AdminCategory extends Model {
  static associate(models) {
    AdminCategory.hasMany(models.Categories, { foreignKey: "admin_category_id", as: "categories" });
  }
}

export default (sequelize) => {
  AdminCategory.init(
    {
      admin_category_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
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
      tableName: "admin_category",
      modelName: "AdminCategory",
      underscored: true,
    },
  );

  return AdminCategory;
};
