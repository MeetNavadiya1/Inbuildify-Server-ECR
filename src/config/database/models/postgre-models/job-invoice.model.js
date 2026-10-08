import { Model, DataTypes } from "sequelize";

export class JobInvoice extends Model {
  static associate(models) {
    JobInvoice.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobInvoice.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobInvoice.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    JobInvoice.hasMany(models.JobInvoicePayment, { foreignKey: "job_invoice_id", as: "payments", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  JobInvoice.init(
    {
      job_invoice_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: { type: DataTypes.UUID, allowNull: false },
      reference_number: { type: DataTypes.STRING(50), allowNull: true },
      description: { type: DataTypes.STRING(500), allowNull: false },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      invoice_date: { type: DataTypes.DATEONLY, allowNull: true },
      due_date: { type: DataTypes.DATEONLY, allowNull: true },
      invoice_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      amount_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "contract_cost",
        validate: { isIn: [["contract_cost", "total_cost"]] },
      },
      // DRAFT → SENT → PAID / OVERDUE
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "draft",
        validate: { isIn: [["draft", "sent", "paid", "overdue", "unsent"]] },
      },
      // Tracks the 4-stage UI workflow
      workflow_status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "created",
        validate: { isIn: [["created", "invoice_sent", "payment_recorded", "receipt_sent"]] },
      },
      email_sent_at: { type: DataTypes.DATE, allowNull: true },
      receipt_sent_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "job_invoice",
      modelName: "JobInvoice",
      underscored: true,
    }
  );
  return JobInvoice;
};
