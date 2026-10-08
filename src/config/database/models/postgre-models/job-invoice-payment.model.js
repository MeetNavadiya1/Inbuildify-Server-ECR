import { Model, DataTypes } from "sequelize";

export class JobInvoicePayment extends Model {
  static associate(models) {
    JobInvoicePayment.belongsTo(models.JobInvoice, {
      foreignKey: "job_invoice_id",
      as: "invoice",
      onDelete: "CASCADE",
    });
    JobInvoicePayment.belongsTo(models.Users, {
      foreignKey: "created_by",
      as: "createdByUser",
      onDelete: "SET NULL",
    });
  }
}

export default (sequelize) => {
  JobInvoicePayment.init(
    {
      job_invoice_payment_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_invoice_id: { type: DataTypes.UUID, allowNull: false },
      payment_date: { type: DataTypes.DATEONLY, allowNull: false },
      payment_method: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: [["cash", "bank", "cheque", "card", "EFTPOS", "personal_online_transfer", "loan_online_transfer"]],
        },
      },
      transaction_no: { type: DataTypes.STRING(50), allowNull: true },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      receipt_sent: { type: DataTypes.BOOLEAN, defaultValue: false },
      receipt_sent_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "job_invoice_payment",
      modelName: "JobInvoicePayment",
      underscored: true,
    }
  );
  return JobInvoicePayment;
};
