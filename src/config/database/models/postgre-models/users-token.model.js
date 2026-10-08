import { Model, DataTypes } from "sequelize";

export class UsersToken extends Model {
  static associate(models) {
    UsersToken.belongsTo(models.Users, { foreignKey: "user_id", as: "user" });
  }
}
export default (sequelize) => {
  UsersToken.init({
    users_token_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    access_token: { type: DataTypes.TEXT, allowNull: false },
    refresh_token: { type: DataTypes.TEXT, allowNull: false },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "users_token", modelName: "UsersToken", underscored: true });
  return UsersToken;
};
