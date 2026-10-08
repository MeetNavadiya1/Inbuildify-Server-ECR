import { Model, DataTypes } from "sequelize";

export class Role extends Model {
  static associate(models) {
    Role.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Role.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Role.belongsTo(models.Company, { foreignKey: "company_id", as: "company" });
    Role.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder" });
    Role.hasMany(models.RolePermission, { foreignKey: "role_id", as: "permissions" });
    Role.hasMany(models.RoleType, { foreignKey: "role_id", as: "roleTypes" });
    Role.hasMany(models.Users, { foreignKey: "role_id", as: "users" });
    Role.hasMany(models.UserRoleMapping, { foreignKey: "role_id", as: "userRoleMappings" });
  }
}

export default (sequelize) => {
  Role.init(
    {
      role_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      is_system: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      can_view_own_permissions: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "role",
      modelName: "Role",
      underscored: true,
      indexes: [
        // Prevent duplicate role names within the same company scope.
        // company_id IS NULL rows (global templates) share a separate uniqueness namespace.
        { unique: true, fields: ["company_id", "name"], name: "role_company_name_unique" },
      ],
    },
  );
  return Role;
};
