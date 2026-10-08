import { Model, DataTypes } from "sequelize";

export class IntegrationCustomFieldHeader extends Model {
  static associate(models) {
    IntegrationCustomFieldHeader.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    IntegrationCustomFieldHeader.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    IntegrationCustomFieldHeader.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    IntegrationCustomFieldHeader.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    IntegrationCustomFieldHeader.hasMany(models.IntegrationCustomFieldItem, { foreignKey: "header1_id", as: "header1Items" });
    IntegrationCustomFieldHeader.hasMany(models.IntegrationCustomFieldItem, { foreignKey: "header2_id", as: "header2Items" });
  }
}

export default (sequelize) => {
  IntegrationCustomFieldHeader.init(
    {
      integration_custom_field_header_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      header_name: { type: DataTypes.STRING(150), allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "integration_custom_field_header", modelName: "IntegrationCustomFieldHeader", underscored: true },
  );
  return IntegrationCustomFieldHeader;
};
