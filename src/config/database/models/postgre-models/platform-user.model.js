import { Model, DataTypes } from "sequelize";

export class PlatformUser extends Model {
  static associate(models) {
    PlatformUser.belongsTo(models.PlatformRole, { foreignKey: "platform_role_id", as: "platformRole" });
  }

  toJSON() {
    const values = { ...this.get() };
    delete values.password;
    return values;
  }
}

export default (sequelize) => {
  PlatformUser.init(
    {
      platform_user_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      platform_role_id: { type: DataTypes.UUID, allowNull: true },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      last_login_at: { type: DataTypes.DATE, allowNull: true },
      failed_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "platform_user",
      modelName: "PlatformUser",
      underscored: true,
      defaultScope: { attributes: { exclude: ["password"] } },
      scopes: { withPassword: { attributes: { include: ["password"] } } },
    },
  );
  return PlatformUser;
};
