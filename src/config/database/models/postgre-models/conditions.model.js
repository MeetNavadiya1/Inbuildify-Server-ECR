import { Model, DataTypes } from "sequelize";

export class Conditions extends Model {
  static associate(models) {
    Conditions.hasMany(models.CategoryItemsCondition, { foreignKey: "condition_id", as: "categoryItemsConditions" });
  }
}

export default (sequelize) => {
  Conditions.init(
    {
      condition_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "conditions",
      modelName: "Conditions",
      underscored: true,
    },
  );
  return Conditions;
};
