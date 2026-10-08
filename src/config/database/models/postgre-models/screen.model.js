import { Model, DataTypes } from "sequelize";

export class Screen extends Model {
  static associate(models) {
    Screen.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Screen.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Screen.hasMany(models.Functionality, { foreignKey: "screen_id", as: "functionalities" });
  }
}

export default (sequelize) => {
  Screen.init(
    {
      screen_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "screen", modelName: "Screen", underscored: true },
  );
  return Screen;
};
