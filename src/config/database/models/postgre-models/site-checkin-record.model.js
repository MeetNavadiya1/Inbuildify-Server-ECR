import { Model, DataTypes } from "sequelize";

export class SiteCheckinRecord extends Model {
  static associate(models) {
    SiteCheckinRecord.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    SiteCheckinRecord.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  SiteCheckinRecord.init(
    {
      site_checkin_record_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      // Optional site/job reference. Kept as STRING because the public form may
      // send a sentinel ("default_job") rather than a real job UUID.
      job_id: { type: DataTypes.STRING(255), allowNull: true },
      job_address: { type: DataTypes.STRING(255), allowNull: true },
      supplier_name: { type: DataTypes.STRING(255), allowNull: true },
      company_name: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(50), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      // { [fieldId]: value } — value is string for text fields, boolean for checkboxes
      responses: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      // PENDING | CONFIRMED | REJECTED
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "PENDING" },
      checked_in_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      confirmed_at: { type: DataTypes.DATE, allowNull: true },
      confirmed_by: { type: DataTypes.STRING(255), allowNull: true },
      builder_notes: { type: DataTypes.TEXT, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "site_checkin_record",
      modelName: "SiteCheckinRecord",
      underscored: true,
    },
  );
  return SiteCheckinRecord;
};
