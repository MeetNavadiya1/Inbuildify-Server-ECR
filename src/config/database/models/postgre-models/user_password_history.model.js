import { Model, DataTypes } from "sequelize";

export class UserPasswordHistory extends Model {
  static associate(models) {
    UserPasswordHistory.belongsTo(models.Users, { foreignKey: "user_id", as: "user", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  UserPasswordHistory.init({
    history_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    old_password: { type: DataTypes.STRING(255), allowNull: false },
    changed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, { sequelize, tableName: "user_password_history", modelName: "UserPasswordHistory", underscored: true, timestamps: false,
    indexes: [{ unique: true, fields: ["user_id", "old_password"] }] });
  return UserPasswordHistory;
};
