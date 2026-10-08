import { Model, DataTypes } from "sequelize";

export class RolePermission extends Model {
  static associate(models) {
    RolePermission.belongsTo(models.Role, { foreignKey: "role_id", as: "role", onDelete: "CASCADE" });
    RolePermission.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    RolePermission.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    RolePermission.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    RolePermission.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  RolePermission.init(
    {
      role_permission_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      role_id: { type: DataTypes.UUID, allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      module_name: { type: DataTypes.STRING(100), allowNull: false },
      can_create: { type: DataTypes.BOOLEAN, defaultValue: false },
      can_read: { type: DataTypes.BOOLEAN, defaultValue: false },
      can_update: { type: DataTypes.BOOLEAN, defaultValue: false },
      can_delete: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "role_permission", modelName: "RolePermission", underscored: true,
      indexes: [{ unique: true, fields: ["role_id", "module_name", "company_id", "builder_id"] }] },
  );
  return RolePermission;
};
