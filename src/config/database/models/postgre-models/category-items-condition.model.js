import { Model, DataTypes } from "sequelize";

export class CategoryItemsCondition extends Model {
  static associate(models) {
    CategoryItemsCondition.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder" });
    CategoryItemsCondition.belongsTo(models.Conditions, { foreignKey: "condition_id", as: "condition" });
  }
}

export default (sequelize) => {
  CategoryItemsCondition.init(
    {
      category_items_condition_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      builder_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      category_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      condition_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      range_start: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      range_end: {
        type: DataTypes.DECIMAL(12, 2),
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
      tableName: "category_items_condition",
      modelName: "CategoryItemsCondition",
      underscored: true,
    },
  );

  return CategoryItemsCondition;
};
