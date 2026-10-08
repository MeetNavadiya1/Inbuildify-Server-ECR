import { Model, DataTypes } from "sequelize";

export class Invites extends Model {
  static associate(models) {
    Invites.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Invites.belongsTo(models.Role, { foreignKey: "role_id", as: "role" });
  }
}
export default (sequelize) => {
  Invites.init({
    invite_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    email: { type: DataTypes.STRING(255), allowNull: false },
    invite_token: { type: DataTypes.TEXT, allowNull: false, unique: true },
    builder_id: { type: DataTypes.UUID, allowNull: false },
    role_id: { type: DataTypes.UUID, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    invited_at: { type: DataTypes.DATE },
  }, { sequelize, tableName: "invites", modelName: "Invites", underscored: true, timestamps: false });
  return Invites;
};
