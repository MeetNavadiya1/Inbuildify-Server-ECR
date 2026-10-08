import { Model, DataTypes } from "sequelize";

export class Job extends Model {
  static associate(models) {
    Job.belongsTo(models.Opportunity, { foreignKey: "opportunity_id", as: "opportunity", onDelete: "CASCADE" });
    Job.belongsTo(models.QuotationVersion, { foreignKey: "quotation_version_id", as: "quotationVersion", onDelete: "SET NULL" });
    Job.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Job.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    // RBAC Phase-4 row-scoping links — the Site Supervisor assigned to this job,
    // and the homebuyer Contact who owns it (both are users_id values).
    Job.belongsTo(models.Users, { foreignKey: "supervisor_id", as: "supervisor", onDelete: "SET NULL" });
    Job.belongsTo(models.Users, { foreignKey: "customer_contact_id", as: "customerContact", onDelete: "SET NULL" });
    Job.belongsTo(models.Users, { foreignKey: "completion_approver_user_id", as: "completionApprover", onDelete: "SET NULL" });
    // Job invoices
    Job.hasMany(models.JobInvoice, { foreignKey: "job_id", as: "invoices", onDelete: "CASCADE" });
    // Current stored colour-selection PDF for this job. The file bytes live only
    // in drive_files; this FK is a direct pointer to the active DriveFile row
    // (mirrors the QuotationVersion report columns).
    Job.belongsTo(models.DriveFile, { foreignKey: "color_report", as: "colorReportFile", onDelete: "SET NULL" });
    // Current stored "Colour Schedule" document PDF for this job.
    Job.belongsTo(models.DriveFile, { foreignKey: "color_document", as: "colorDocumentFile", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  Job.init(
    {
      job_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      tracking_token: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), allowNull: false },
      reference_number: { type: DataTypes.STRING(30), allowNull: false },
      opportunity_id: { type: DataTypes.UUID, allowNull: true },
      quotation_version_id: { type: DataTypes.UUID, allowNull: true },
      job_note: { type: DataTypes.STRING(1000), allowNull: true },
      send_email: { type: DataTypes.BOOLEAN, defaultValue: false },
      commencement_letter_sent: { type: DataTypes.BOOLEAN, defaultValue: false },
      // Customer acknowledgment of the Commencement Letter (public /external page).
      commencement_ack_status: { type: DataTypes.STRING(20), allowNull: true },
      commencement_ack_comments: { type: DataTypes.STRING(500), allowNull: true },
      commencement_ack_at: { type: DataTypes.DATE, allowNull: true },
      completion_approver_user_id: { type: DataTypes.UUID, allowNull: true },
      completion_approval_status: { type: DataTypes.STRING(20), allowNull: true },
      completion_approval_comments: { type: DataTypes.STRING(500), allowNull: true },
      completion_approval_sent_at: { type: DataTypes.DATE, allowNull: true },
      completion_approval_at: { type: DataTypes.DATE, allowNull: true },
      // Tenant-scoping columns — mirrored from leads so queries can filter
      // directly on the job table without walking the opportunity → leads chain.
      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      // RBAC Phase-4 row-scoping columns (see Job.associate). Nullable: a job
      // need not have a supervisor or a portal contact assigned yet.
      supervisor_id: { type: DataTypes.UUID, allowNull: true },
      customer_contact_id: { type: DataTypes.UUID, allowNull: true },
      // Job lifecycle status
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: "In Progress" },
      // Lifecycle timestamps behind the Settings → Job automations. completed_at
      // is the anchor the auto-archive sweep counts its N days from.
      completed_at: { type: DataTypes.DATE, allowNull: true },
      archived_at: { type: DataTypes.DATE, allowNull: true },
      // Date when all preconstruction sub-stages were marked complete/skipped
      preconstruction_closed_at: { type: DataTypes.DATEONLY, allowNull: true },
      // Date when the colour selection was approved
      color_approved_at: { type: DataTypes.DATEONLY, allowNull: true },
      // Contract dates — required to auto-generate stage-payment invoices
      contract_prepared_date: { type: DataTypes.DATEONLY, allowNull: true },
      contract_signed_date: { type: DataTypes.DATEONLY, allowNull: true },
      // FK -> drive_files.file_id for the stored colour-selection PDF (regenerated
      // whenever the colour selections change). See Job.associate colorReportFile.
      color_report: { type: DataTypes.UUID, allowNull: true },
      // FK -> drive_files.file_id for the stored "Colour Schedule" document PDF
      // (generated/updated from the Generate Colors Document page).
      color_document: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job", modelName: "Job", underscored: true },
  );
  return Job;
};
