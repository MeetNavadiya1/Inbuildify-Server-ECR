import { Model, DataTypes } from "sequelize";

export class RoleType extends Model {
  static associate(models) {
    RoleType.belongsTo(models.Role, { foreignKey: "role_id", as: "role", onDelete: "CASCADE" });
    RoleType.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    RoleType.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    RoleType.hasMany(models.UserRoleMapping, { foreignKey: "role_type_id", as: "userRoleMappings" });
  }
}

export default (sequelize) => {
  RoleType.init(
    {
      role_type_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      role_id: { type: DataTypes.UUID, allowNull: false },
      type_name: { type: DataTypes.STRING(100), allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "role_type", modelName: "RoleType", underscored: true },
  );
  return RoleType;
};
