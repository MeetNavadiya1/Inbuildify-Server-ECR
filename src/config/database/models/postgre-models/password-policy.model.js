import { Model, DataTypes } from "sequelize";

export class PasswordPolicy extends Model {
  static associate(models) {
    PasswordPolicy.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    PasswordPolicy.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    PasswordPolicy.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    PasswordPolicy.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  PasswordPolicy.init(
    {
      password_policy_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      expires_in_days: { type: DataTypes.INTEGER, defaultValue: 90 },
      invalid_attempt_limit: { type: DataTypes.INTEGER, defaultValue: 5 },
      alert_before_expiry_days: { type: DataTypes.INTEGER, defaultValue: 7 },
      password_history_count: { type: DataTypes.INTEGER, defaultValue: 5 },
      enforce_strong_password: { type: DataTypes.BOOLEAN, defaultValue: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "password_policy", modelName: "PasswordPolicy", underscored: true,
      indexes: [{ unique: true, fields: ["company_id", "builder_id"] }] },
  );
  return PasswordPolicy;
};
