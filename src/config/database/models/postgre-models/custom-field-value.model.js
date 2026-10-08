import { Model, DataTypes } from "sequelize";

export class CustomFieldValue extends Model {
  static associate(models) {
    CustomFieldValue.belongsTo(models.CustomField, { foreignKey: "custom_field_id", as: "customField", onDelete: "CASCADE" });
    CustomFieldValue.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    CustomFieldValue.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  CustomFieldValue.init(
    {
      custom_field_value_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      custom_field_id: { type: DataTypes.UUID, allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      record_id: { type: DataTypes.UUID, allowNull: false },
      value_text: { type: DataTypes.TEXT, allowNull: true },
      value_number: { type: DataTypes.DECIMAL, allowNull: true },
      value_date: { type: DataTypes.DATEONLY, allowNull: true },
      value_boolean: { type: DataTypes.BOOLEAN, allowNull: true },
      value_list: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "custom_field_value", modelName: "CustomFieldValue", underscored: true },
  );
  return CustomFieldValue;
};
