import { Model, DataTypes } from "sequelize";

export class HouseLandPackage extends Model {
  static associate(models) {
    HouseLandPackage.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    HouseLandPackage.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    HouseLandPackage.belongsTo(models.FloorPlan, { foreignKey: "floor_plan_id", as: "floorPlan", onDelete: "SET NULL" });
    HouseLandPackage.belongsTo(models.Facade, { foreignKey: "facade_id", as: "facade", onDelete: "SET NULL" });
    HouseLandPackage.belongsTo(models.HouseFeature, { foreignKey: "house_feature_id", as: "houseFeature", onDelete: "SET NULL" });
    HouseLandPackage.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    HouseLandPackage.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    HouseLandPackage.belongsTo(models.Users, { foreignKey: "contact_id", as: "contact", onDelete: "SET NULL" });
    HouseLandPackage.belongsTo(models.TemplateEmail, { foreignKey: "template_id", as: "template", onDelete: "SET NULL" });
    HouseLandPackage.belongsTo(models.Lot, { foreignKey: "lot_id", as: "lot", onDelete: "SET NULL" });
    HouseLandPackage.belongsTo(models.DwellingType, { foreignKey: "dwelling_type_id", as: "dwellingType", onDelete: "SET NULL" });
    HouseLandPackage.belongsTo(models.Range, { foreignKey: "range_id", as: "range", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  HouseLandPackage.init(
    {
      house_land_package_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      title: { type: DataTypes.STRING(255), allowNull: true },
      range_id: { type: DataTypes.UUID, allowNull: true },
      dwelling_type_id: { type: DataTypes.UUID, allowNull: true },
      template_id: { type: DataTypes.UUID, allowNull: true },
      contact_id: { type: DataTypes.UUID, allowNull: true },
      contact_show_pdf: { type: DataTypes.BOOLEAN, allowNull: true },
      lot_id: { type: DataTypes.UUID, allowNull: true },
      price_type: { type: DataTypes.STRING(100), allowNull: true },
      floor_plan_id: { type: DataTypes.UUID, allowNull: true },
      floor_plan_description: { type: DataTypes.STRING(1000), allowNull: true },
      facade_id: { type: DataTypes.UUID, allowNull: true },
      package_group_id: { type: DataTypes.UUID, allowNull: true },
      package_description: { type: DataTypes.STRING(3000), allowNull: true },
      house_feature_id: { type: DataTypes.UUID, allowNull: true },
      disclaimer_description: { type: DataTypes.STRING(3000), allowNull: true },
      disclaimer_type: { type: DataTypes.STRING(255), allowNull: true },
      attach_files: { type: DataTypes.JSONB, defaultValue: [] },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "house_land_package", modelName: "HouseLandPackage", underscored: true },
  );
  return HouseLandPackage;
};
