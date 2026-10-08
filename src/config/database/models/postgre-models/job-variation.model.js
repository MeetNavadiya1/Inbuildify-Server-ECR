import { Model, DataTypes } from "sequelize";

export class JobVariation extends Model {
  static associate(models) {
    JobVariation.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobVariation.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobVariation.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobVariation.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobVariation.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    JobVariation.belongsTo(models.Users, { foreignKey: "approved_by", as: "approvedByUser", onDelete: "SET NULL" });
    JobVariation.hasMany(models.JobVariationItem, { foreignKey: "variation_id", as: "variationItems", onDelete: "CASCADE" });
    JobVariation.belongsTo(models.DriveFile, { foreignKey: "signed_document", as: "signedDocumentFile", onDelete: "SET NULL" });
    JobVariation.belongsTo(models.DriveFile, { foreignKey: "invoice_document", as: "invoiceDocumentFile", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobVariation.init(
    {
      variation_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: { type: DataTypes.UUID, allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      reference_id: { type: DataTypes.STRING(60), allowNull: true },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      title: { type: DataTypes.STRING(255), allowNull: true },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      requested_by: { type: DataTypes.STRING(255), allowNull: true },
      delayed_by: { type: DataTypes.STRING(255), allowNull: true },
      delayed_days: { type: DataTypes.INTEGER, allowNull: true },
      drawing_changes_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "draft" },
      // Current active stage in the status tracker (1 = Create, 2 = Approve, …).
      stage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      // Answer to the tracker's "Price Included in contract ?" step. null =
      // unanswered, true = included (no invoice), false = invoice the customer.
      price_included: { type: DataTypes.BOOLEAN, allowNull: true },
      invoice_id: { type: DataTypes.UUID, allowNull: true },
      // FK to drive_files — the manually-uploaded signed variation document.
      signed_document: { type: DataTypes.UUID, allowNull: true },
      // FK to drive_files — the generated invoice PDF sent to the customer.
      invoice_document: { type: DataTypes.UUID, allowNull: true },
      variation_date: { type: DataTypes.DATEONLY, allowNull: true },
      show_price_master_in_pdf: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      items: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      approved_by: { type: DataTypes.UUID, allowNull: true },
      approved_at: { type: DataTypes.DATEONLY, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "job_variation",
      modelName: "JobVariation",
      underscored: true,
    },
  );
  return JobVariation;
};
