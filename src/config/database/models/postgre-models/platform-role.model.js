import { Model, DataTypes } from "sequelize";

export class PlatformRole extends Model {
  static associate(models) {
    PlatformRole.hasMany(models.PlatformUser, { foreignKey: "platform_role_id", as: "members" });
  }
}

export default (sequelize) => {
  PlatformRole.init(
    {
      platform_role_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      scope: { type: DataTypes.STRING(120), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      permissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "platform_role",
      modelName: "PlatformRole",
      underscored: true,
    },
  );
  return PlatformRole;
};
