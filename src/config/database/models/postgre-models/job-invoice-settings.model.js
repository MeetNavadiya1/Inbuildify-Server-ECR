import { Model, DataTypes } from "sequelize";

export class JobInvoiceSettings extends Model {
  static associate(models) {
    JobInvoiceSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobInvoiceSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobInvoiceSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobInvoiceSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    JobInvoiceSettings.hasMany(models.JobInvoiceStagePayments, { foreignKey: "job_invoice_settings_id", as: "stagePayments" });
  }
}

export default (sequelize) => {
  JobInvoiceSettings.init(
    {
      job_invoice_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      show_invoice_summary_in_pdf: { type: DataTypes.BOOLEAN, defaultValue: false },
      invoice_terms_days: { type: DataTypes.INTEGER, defaultValue: 0 },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_invoice_settings", modelName: "JobInvoiceSettings", underscored: true },
  );
  return JobInvoiceSettings;
};
