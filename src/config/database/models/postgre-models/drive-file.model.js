import { Model, DataTypes, Op } from "sequelize";

export class DriveFile extends Model {
  static associate(models) {
    DriveFile.belongsTo(models.Drive, { foreignKey: "folder_id", as: "folder", onDelete: "CASCADE" });
    DriveFile.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    DriveFile.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    DriveFile.belongsTo(models.Users, { foreignKey: "uploaded_by", as: "uploadedByUser", onDelete: "SET NULL" });
    DriveFile.belongsTo(models.Leads, { foreignKey: "lead_id", as: "lead", onDelete: "CASCADE" });
    DriveFile.hasMany(models.DriveFileVersion, { foreignKey: "file_id", as: "versions" });
  }
}

export default (sequelize) => {
  DriveFile.init(
    {
      file_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      folder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      uploaded_by: { type: DataTypes.UUID, allowNull: true },
      lead_id: { type: DataTypes.UUID, allowNull: true },
      reference_id: { type: DataTypes.UUID, allowNull: true },
      reference_type: { type: DataTypes.STRING, allowNull: true },
      sub_reference_id: { type: DataTypes.UUID, allowNull: true },
      sub_reference_type: { type: DataTypes.STRING, allowNull: true },
      original_name: { type: DataTypes.STRING, allowNull: false },
      // Unique per company, declared as a named index below rather than
      // `unique: true` here. Two reasons: the name only has to be unambiguous
      // inside the tenant that owns the file, and an inline `unique: true` is
      // auto-named by Postgres, so every `sync()` adds ANOTHER
      // drive_files_file_name_keyN — this database had collected four.
      file_name: { type: DataTypes.STRING, allowNull: false },
      s3_key: { type: DataTypes.STRING, allowNull: false },
      file_extension: { type: DataTypes.STRING, allowNull: true },
      mime_type: { type: DataTypes.STRING, allowNull: true },
      size: { type: DataTypes.BIGINT, allowNull: true },
      is_starred: { type: DataTypes.BOOLEAN, defaultValue: false },
      // Admin → Document Management's per-file ruling on whether this document
      // may be edited — PDF, workbook or Word document alike. NULL means no
      // administrator has decided, which reads as allowed; see
      // `isDocumentEditingAllowed`.
      document_editable: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
      document_editable_updated_by: { type: DataTypes.UUID, allowNull: true },
      document_editable_updated_at: { type: DataTypes.DATE, allowNull: true },
      // FALSE cuts this file off from the shares on the folder it sits in — set
      // when it is restored from Trash, so a file deleted out of a shared
      // folder does not reappear for everyone when the owner restores it.
      inherit_shares: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
      thumbnail_s3_key: { type: DataTypes.STRING, allowNull: true },
      thumbnail_status: { type: DataTypes.STRING, allowNull: true, defaultValue: "pending" },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      created_at: { type: DataTypes.DATE },
      updated_at: { type: DataTypes.DATE },
      deleted_at: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "drive_files",
      modelName: "DriveFile",
      underscored: true,
      paranoid: true,
      indexes: [
        { fields: ["company_id"] },
        { fields: ["folder_id"] },
        { fields: ["deleted_at"] },
        // One file name per company. Mirrors migration 20260817170000, which
        // replaced the table-wide unique this used to carry — that one let one
        // tenant's file reserve a name against every other tenant, and the
        // generated names (lead number + type + date) collide across companies
        // by construction. Not partial on deleted_at, so a file in Trash keeps
        // its name reserved and can be restored without a fresh row having
        // taken it; `ensureUniqueDriveFileName` probes with paranoid:false to
        // match.
        {
          name: "drive_files_company_file_name_active_unique",
          unique: true,
          fields: ["company_id", "file_name"],
        },
        // Guarantees a single active (deleted_at IS NULL) DriveFile per
        // polymorphic reference. Mirrors the partial unique index created in
        // migration 20260523120000. Partial on deleted_at so soft-deleted rows
        // never collide with a new active row for the same reference.
        {
          name: "drive_files_polymorphic_active_unique",
          unique: true,
          fields: ["reference_id", "reference_type", "sub_reference_type"],
          where: {
            deleted_at: null,
            reference_id: { [Op.ne]: null },
            reference_type: { [Op.ne]: null },
            sub_reference_type: { [Op.ne]: null },
          },
        },
      ],
    },
  );
  return DriveFile;
};
