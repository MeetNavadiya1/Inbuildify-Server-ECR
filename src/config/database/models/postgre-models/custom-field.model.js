import { Model, DataTypes } from "sequelize";

export class CustomField extends Model {
  static associate(models) {
    CustomField.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    CustomField.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    CustomField.belongsTo(models.CustomFieldModule, { foreignKey: "module_id", as: "module", onDelete: "CASCADE" });
    CustomField.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    CustomField.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  CustomField.init({
    custom_field_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    module_id: { type: DataTypes.UUID, allowNull: false },
    field_name: { type: DataTypes.STRING(150), allowNull: false },
    field_type: { type: DataTypes.STRING(50), allowNull: false },
    options: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "custom_field", modelName: "CustomField", underscored: true });
  return CustomField;
};
