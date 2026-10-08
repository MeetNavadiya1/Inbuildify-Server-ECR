import { Model, DataTypes } from "sequelize";

export class IntegrationCustomFieldItem extends Model {
  static associate(models) {
    IntegrationCustomFieldItem.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    IntegrationCustomFieldItem.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    IntegrationCustomFieldItem.belongsTo(models.IntegrationCustomFieldHeader, { foreignKey: "header1_id", as: "header1", onDelete: "SET NULL" });
    IntegrationCustomFieldItem.belongsTo(models.IntegrationCustomFieldHeader, { foreignKey: "header2_id", as: "header2", onDelete: "SET NULL" });
    IntegrationCustomFieldItem.belongsTo(models.Users, { foreignKey: "assignee_user_id", as: "assigneeUser", onDelete: "SET NULL" });
    IntegrationCustomFieldItem.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    IntegrationCustomFieldItem.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  IntegrationCustomFieldItem.init(
    {
      integration_custom_field_item_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      header1_id: { type: DataTypes.UUID, allowNull: true },
      header2_id: { type: DataTypes.UUID, allowNull: true },
      value1: { type: DataTypes.STRING(255), allowNull: true },
      value2: { type: DataTypes.STRING(255), allowNull: true },
      assignee_user_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "integration_custom_field_item", modelName: "IntegrationCustomFieldItem", underscored: true },
  );
  return IntegrationCustomFieldItem;
};
