import { Model, DataTypes } from "sequelize";

export class JobInvoiceStagePayments extends Model {
  static associate(models) {
    JobInvoiceStagePayments.belongsTo(models.JobInvoiceSettings, { foreignKey: "job_invoice_settings_id", as: "jobInvoiceSettings", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  JobInvoiceStagePayments.init(
    {
      job_invoice_stage_payment_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      job_invoice_settings_id: { type: DataTypes.UUID, allowNull: false },
      description: { type: DataTypes.STRING(150), allowNull: false },
      percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      // Which of the contract's two payment methods this stage belongs to.
      method: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "method1" },
      // A sequence within one method, not across the whole settings row.
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_invoice_stage_payments", modelName: "JobInvoiceStagePayments", underscored: true },
  );
  return JobInvoiceStagePayments;
};
