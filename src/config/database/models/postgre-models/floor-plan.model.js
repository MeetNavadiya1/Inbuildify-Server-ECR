import { Model, DataTypes } from "sequelize";
import { resolveImageUrls } from "../../../../helper/imageDriveFile.helper.js";

export class FloorPlan extends Model {
  static associate(models) {
    FloorPlan.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    FloorPlan.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    FloorPlan.belongsTo(models.DwellingType, { foreignKey: "dwelling_type_id", as: "dwellingType", onDelete: "SET NULL" });
    FloorPlan.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    FloorPlan.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    FloorPlan.hasMany(models.FloorPlanFacadeMap, { foreignKey: "floor_plan_id", as: "facadeMaps" });
    FloorPlan.hasMany(models.FloorPlanPricelistItemMap, { foreignKey: "floor_plan_id", as: "pricelistItemMaps" });
    FloorPlan.belongsTo(models.Range, { foreignKey: "range_id", as: "range", onDelete: "SET NULL" });
    FloorPlan.belongsTo(models.Location, { foreignKey: "location_id", as: "location", onDelete: "SET NULL" });
    FloorPlan.belongsTo(models.DriveFile, { foreignKey: "detailed_image", as: "detailedImageFile", onDelete: "SET NULL" });
    FloorPlan.belongsTo(models.DriveFile, { foreignKey: "simple_image", as: "simpleImageFile", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  FloorPlan.init(
    {
      floor_plan_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      min_land_width: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
      min_land_depth: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
      dwelling_area: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      dwelling_type_id: { type: DataTypes.UUID, allowNull: true },
      beds: { type: DataTypes.INTEGER, allowNull: true },
      baths: { type: DataTypes.INTEGER, allowNull: true },
      carpark: { type: DataTypes.INTEGER, allowNull: true },
      living: { type: DataTypes.INTEGER, allowNull: true },
      range_id: { type: DataTypes.UUID, allowNull: true },
      garage_area: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      porch_area: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      alfresco_area: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      total_area: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      detailed_image: { type: DataTypes.UUID, allowNull: true },
      simple_image: { type: DataTypes.UUID, allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.BOOLEAN, defaultValue: true },
      location_id: { type: DataTypes.UUID, allowNull: true },
      // Set only on rows the sample-data importer created, so Settings →
      // Sample Data can purge them without touching the builder's own catalog.
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "floor_plan", modelName: "FloorPlan", underscored: true },
  );

  // Resolve image UUID FKs → absolute S3 URLs on read (one batched query).
  FloorPlan.addHook("afterFind", (results, options) =>
    resolveImageUrls(results, ["detailed_image", "simple_image"], sequelize, options),
  );

  return FloorPlan;
};
