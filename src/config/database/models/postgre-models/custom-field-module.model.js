import { Model, DataTypes } from "sequelize";

export class CustomFieldModule extends Model {
  static associate(models) {
    CustomFieldModule.hasMany(models.CustomField, { foreignKey: "module_id", as: "customFields" });
  }
}

export default (sequelize) => {
  CustomFieldModule.init(
    {
      module_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "custom_field_module", modelName: "CustomFieldModule", underscored: true },
  );
  return CustomFieldModule;
};
