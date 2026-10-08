import { Model, DataTypes } from "sequelize";

export class HouseLandPackageSettings extends Model {
  static associate(models) {
    HouseLandPackageSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    HouseLandPackageSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    HouseLandPackageSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    HouseLandPackageSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  HouseLandPackageSettings.init(
    {
      house_land_package_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      include_facade_cost_in_total: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "house_land_package_settings", modelName: "HouseLandPackageSettings", underscored: true },
  );
  return HouseLandPackageSettings;
};
