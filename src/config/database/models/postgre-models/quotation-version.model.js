import { Model, DataTypes } from "sequelize";
import { DRIVE_FILE_MAPPING } from "../../../../constants/driveFile.js";
import {
  cloneQuotationVersionImages,
  syncQuotationVersionImages,
} from "../../../../helper/quotationVersionImage.helper.js";

export class QuotationVersion extends Model {
  static associate(models) {
    QuotationVersion.belongsTo(models.Quotation, { foreignKey: "quotation_id", as: "quotation", onDelete: "CASCADE" });
    QuotationVersion.belongsTo(models.FloorPlan, { foreignKey: "floor_plan_id", as: "floorPlan", onDelete: "SET NULL" });
    QuotationVersion.belongsTo(models.Facade, { foreignKey: "facade_id", as: "facade", onDelete: "SET NULL" });
    QuotationVersion.hasMany(models.Job, { foreignKey: "quotation_version_id", as: "jobs" });
    QuotationVersion.hasMany(models.QuotationVersionPricelistItemMap, { foreignKey: "quotation_version_id", as: "pricelistItemMaps" });
    QuotationVersion.hasMany(models.QuotationVersionCustomSection, { foreignKey: "quotation_version_id", as: "customSections" });
    QuotationVersion.hasMany(models.QuotationVersionPackageMap, { foreignKey: "quotation_version_id", as: "packageMaps" });
    QuotationVersion.belongsTo(models.Package, { foreignKey: "package_id", as: "package" });
    QuotationVersion.belongsTo(models.StructureEngineer, { foreignKey: "structure_engineer_id", as: "structureEngineer" });
    QuotationVersion.belongsTo(models.Location, { foreignKey: "location_id", as: "location" });
    QuotationVersion.belongsTo(models.Range, { foreignKey: "range_id", as: "range" });
    QuotationVersion.belongsTo(models.DwellingType, { foreignKey: "dwelling_type_id", as: "dwellingType" });
    QuotationVersion.hasMany(models.QuotationVersionItem, { foreignKey: "quotation_version_id", as: "quotationVersionItems" });
    QuotationVersion.belongsTo(models.DocuSignEnvelope, { foreignKey: "esign_envelope_id", as: "esignEnvelope" });

    // Polymorphic DriveFile relationships (new storage strategy for generated PDFs)
    // Replaces legacy pdf_url, signed_pdf_url, upload_report, structure_engineer_report, quotation_version_detail columns.
    const driveFileScope = (subReferenceType) => ({
      foreignKey: "reference_id",
      constraints: false,
      scope: {
        reference_type: DRIVE_FILE_MAPPING.REFERENCE_NAMES.QUOTATION_VERSION,
        sub_reference_type: subReferenceType,
      },
    });

    QuotationVersion.hasMany(models.DriveFile, {
      ...driveFileScope(DRIVE_FILE_MAPPING.SUB_REFERENCES.QUOTATION_REPORT),
      as: "quotationReports",
    });
    QuotationVersion.hasMany(models.DriveFile, {
      ...driveFileScope(DRIVE_FILE_MAPPING.SUB_REFERENCES.SIGNED_QUOTATION_REPORT),
      as: "signedReports",
    });
    QuotationVersion.hasMany(models.DriveFile, {
      ...driveFileScope(DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_REPORT),
      as: "engineerReports",
    });
    QuotationVersion.hasMany(models.DriveFile, {
      ...driveFileScope(DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_UPLOAD),
      as: "engineerUploads",
    });
    QuotationVersion.hasMany(models.DriveFile, {
      ...driveFileScope(DRIVE_FILE_MAPPING.SUB_REFERENCES.ENGINEERING_REQUIREMENT),
      as: "engineeringRequirements",
    });

    // Direct FK pointers: these columns store a single DriveFile PK (the
    // current report file). constraints:false because the real FK is managed
    // by the migration, not Sequelize sync.
    QuotationVersion.belongsTo(models.DriveFile, {
      foreignKey: "structure_engineer_report",
      as: "structureEngineerReportFile",
      constraints: false,
    });
    QuotationVersion.belongsTo(models.DriveFile, {
      foreignKey: "quotation_version_detail",
      as: "engineeringRequirementFile",
      constraints: false,
    });
  }
}

export default (sequelize) => {
  QuotationVersion.init(
    {
      quotation_version_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      quotation_id: { type: DataTypes.UUID, allowNull: true },
      quotation_version_no: { type: DataTypes.INTEGER, allowNull: true },
      location_id: { type: DataTypes.UUID, allowNull: true },
      range_id: { type: DataTypes.UUID, allowNull: true },
      dwelling_type_id: { type: DataTypes.UUID, allowNull: true },
      floor_plan_id: { type: DataTypes.UUID, allowNull: true },
      facade_id: { type: DataTypes.UUID, allowNull: true },
      is_approve: { type: DataTypes.BOOLEAN, defaultValue: false },
      sketch_number: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      package_id: { type: DataTypes.UUID, allowNull: true },
      structure_engineer_id: { type: DataTypes.UUID, allowNull: true },
      structure_engineer_price: { type: DataTypes.INTEGER, allowNull: true },
      facade_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true, defaultValue: 0 },
      pdf_url: { type: DataTypes.TEXT, allowNull: true },
      esign_status: { type: DataTypes.ENUM('pending', 'sent', 'signed', 'completed', 'declined', 'voided'), allowNull: true, defaultValue: null },
      esign_envelope_id: { type: DataTypes.UUID, allowNull: true },
      signed_pdf_url: { type: DataTypes.TEXT, allowNull: true },
      upload_report: { type: DataTypes.TEXT, allowNull: true },
      // Holds the DriveFile PK (sub_reference_type=StructureEngineerReport).
      // The s3_key/URL lives in drive_files, not here.
      structure_engineer_report: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
      send_to_engineer: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_uploaded: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Holds the DriveFile PK (sub_reference_type=EngineeringRequirement).
      // The s3_key/URL lives in drive_files, not here.
      quotation_version_detail: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, tableName: "quotation_version", modelName: "QuotationVersion", underscored: true },
  );
  // DriveFile synchronisation (clone facade / floor plan images onto the
  // version). Implementation lives in the helper to keep the model declarative.
  QuotationVersion.addHook("afterCreate", (instance, options) =>
    cloneQuotationVersionImages(instance, sequelize, options.transaction),
  );

  QuotationVersion.addHook("afterUpdate", (instance, options) =>
    syncQuotationVersionImages(instance, sequelize, options.transaction),
  );

  return QuotationVersion;
};
