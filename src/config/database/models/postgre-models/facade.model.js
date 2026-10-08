import { Model, DataTypes } from "sequelize";
import { resolveImageUrls } from "../../../../helper/imageDriveFile.helper.js";

export class Facade extends Model {
  static associate(models) {
    Facade.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Facade.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Facade.belongsTo(models.DwellingType, { foreignKey: "dwelling_type_id", as: "dwellingType", onDelete: "SET NULL" });
    Facade.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Facade.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Facade.hasMany(models.FloorPlanFacadeMap, { foreignKey: "facade_id", as: "floorPlanMaps" });
    Facade.belongsTo(models.Location, { foreignKey: "location_id", as: "location", onDelete: "SET NULL" });
    Facade.belongsTo(models.Range, { foreignKey: "range_id", as: "range", onDelete: "SET NULL" });
    Facade.belongsTo(models.DriveFile, { foreignKey: "image", as: "facadeImageFile", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  Facade.init(
    {
      facade_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      location_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      dwelling_type_id: { type: DataTypes.UUID, allowNull: true },
      range_id: { type: DataTypes.UUID, allowNull: true },
      cost_type: { type: DataTypes.STRING(20), defaultValue: "standard" },
      cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      builder_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      image: { type: DataTypes.UUID, allowNull: true },
      status: { type: DataTypes.BOOLEAN, defaultValue: true },
      best_faced: { type: DataTypes.BOOLEAN, defaultValue: false },
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
    { sequelize, tableName: "facade", modelName: "Facade", underscored: true },
  );

  // Resolve the image UUID FK → absolute S3 URL on read (one batched query).
  Facade.addHook("afterFind", (results, options) =>
    resolveImageUrls(results, ["image"], sequelize, options),
  );

  return Facade;
};
