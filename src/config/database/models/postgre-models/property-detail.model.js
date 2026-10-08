import { Model, DataTypes } from "sequelize";
import { resolveImageUrls } from "../../../../helper/imageDriveFile.helper.js";

export class PropertyDetail extends Model {
  static associate(models) {
    PropertyDetail.belongsTo(models.Lot, { foreignKey: "lot_id", as: "lot", onDelete: "SET NULL" });
    PropertyDetail.belongsTo(models.State, { foreignKey: "state_id", as: "state", onDelete: "SET NULL" });
    PropertyDetail.belongsTo(models.Country, { foreignKey: "country_id", as: "country", onDelete: "SET NULL" });
    PropertyDetail.belongsTo(models.Estate, { foreignKey: "estate_id", as: "estate", onDelete: "CASCADE" });
    PropertyDetail.belongsTo(models.EstateStages, { foreignKey: "estate_stage_id", as: "estateStage", onDelete: "CASCADE" });
    PropertyDetail.hasMany(models.Leads, { foreignKey: "property_detail_id", as: "leads" });
    // compaction_report_url stores a DriveFile PK (UUID FK); the real file lives
    // in drive_files. constraints:false because the FK is managed by migration.
    PropertyDetail.belongsTo(models.DriveFile, { foreignKey: "compaction_report_url", as: "compactionReportFile", constraints: false });
  }
}

export default (sequelize) => {
  PropertyDetail.init(
    {
      property_detail_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      lot_id: { type: DataTypes.UUID, allowNull: true },
      lot_number: { type: DataTypes.STRING(255), allowNull: true },
      street: { type: DataTypes.STRING(255), allowNull: true },
      address_line1: { type: DataTypes.STRING(255), allowNull: true },
      address_line2: { type: DataTypes.STRING(255), allowNull: true },
      city: { type: DataTypes.STRING(255), allowNull: true },
      state_id: { type: DataTypes.UUID, allowNull: true },
      country_id: { type: DataTypes.UUID, allowNull: true },
      zip_code: { type: DataTypes.STRING(10), allowNull: true },
      estate_id: { type: DataTypes.UUID, allowNull: true },
      estate_stage_id: { type: DataTypes.UUID, allowNull: true },
      estate_name: { type: DataTypes.STRING(255), allowNull: true },
      title_status: { type: DataTypes.STRING(255), allowNull: true },
      title_date: { type: DataTypes.DATEONLY, allowNull: true },
      clearing_date: { type: DataTypes.DATEONLY, allowNull: true },
      compaction_report: { type: DataTypes.STRING(255), allowNull: true },
      // Holds the DriveFile PK (sub_reference_type=CompactionReport). The
      // s3_key/URL lives in drive_files; the afterFind hook below resolves this
      // UUID back to an absolute S3 URL so API responses stay unchanged.
      compaction_report_url: { type: DataTypes.UUID, allowNull: true },
      compaction_report_content: { type: DataTypes.JSONB, allowNull: true },
      land_type: { type: DataTypes.STRING(255), allowNull: true },
      width_m: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      depth_m: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      total_size_m2: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      site_fall_mm: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      land_fill_mm: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      bush_fire: { type: DataTypes.BOOLEAN, allowNull: true },
      corner_block: { type: DataTypes.BOOLEAN, allowNull: true },
      is_hl_package_lot: { type: DataTypes.BOOLEAN, allowNull: true },
      compaction_report_provider: { type: DataTypes.STRING(255), allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "property_detail", modelName: "PropertyDetail", underscored: true },
  );

  // Resolve the compaction_report_url UUID FK → absolute S3 URL on read (one
  // batched DriveFile query). Mirrors Facade.image / FloorPlan image columns.
  PropertyDetail.addHook("afterFind", (results, options) =>
    resolveImageUrls(results, ["compaction_report_url"], sequelize, options),
  );

  return PropertyDetail;
};
