import { Model, DataTypes } from "sequelize";

export class UserSocialAccount extends Model {
  static associate(models) {
    UserSocialAccount.belongsTo(models.Users, { foreignKey: "user_id", as: "user", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  UserSocialAccount.init({
    id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    provider: { type: DataTypes.ENUM("google", "apple"), allowNull: false },
    provider_user_id: { type: DataTypes.STRING(255), allowNull: false },
    profile_data: { type: DataTypes.JSONB, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, {
    sequelize,
    tableName: "user_social_accounts",
    modelName: "UserSocialAccount",
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["provider", "provider_user_id"]
      }
    ]
  });
  return UserSocialAccount;
};
