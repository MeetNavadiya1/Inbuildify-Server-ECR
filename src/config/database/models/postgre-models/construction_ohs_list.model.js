import { Model, DataTypes } from "sequelize";

export class ConstructionOhsList extends Model {
  static associate(models) {
    ConstructionOhsList.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ConstructionOhsList.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    ConstructionOhsList.belongsTo(models.ConstructionOhsSettings, { foreignKey: "construction_ohs_settings_id", as: "ohsSettings", onDelete: "CASCADE" });
    ConstructionOhsList.belongsTo(models.ConstructionOhsList, { foreignKey: "parent_id", as: "parent", onDelete: "CASCADE" });
    ConstructionOhsList.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ConstructionOhsList.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  ConstructionOhsList.init({
    construction_ohs_list_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    construction_ohs_settings_id: { type: DataTypes.UUID, allowNull: true },
    field_type: { type: DataTypes.STRING(20), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 1 },
    parent_id: { type: DataTypes.UUID, allowNull: true },
    add_defaults: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
    field_name: { type: DataTypes.STRING(100), allowNull: true },
  }, { sequelize, tableName: "construction_ohs_list", modelName: "ConstructionOhsList", underscored: true });
  return ConstructionOhsList;
};
