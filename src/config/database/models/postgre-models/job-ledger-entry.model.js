import { Model, DataTypes } from "sequelize";

/**
 * Manual credit / debit entries on a job's account.
 *
 * Two books share this table, kept apart by `ledger`:
 *
 *  - `customer` — money between the builder and the homebuyer. A debit is an
 *    extra charge the customer owes (site cost, out-of-contract work); a credit
 *    is money off (discount, rebate) or a payment taken outside an invoice.
 *    These MOVE "Balance to be paid".
 *
 *  - `expense`  — the builder's own spend on the job: outside/personal expenses
 *    that were never billed to anybody. A debit is money out; a credit is money
 *    back (supplier refund, reimbursement). These NEVER move the customer's
 *    balance — they only drive Profit / Loss.
 *
 * Invoice payments are NOT written here. They already live in
 * `job_invoice_payment` and are projected into the ledger read-only, so the two
 * can never drift apart or double-count.
 */
export class JobLedgerEntry extends Model {
  static associate(models) {
    JobLedgerEntry.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobLedgerEntry.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobLedgerEntry.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobLedgerEntry.init(
    {
      job_ledger_entry_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: { type: DataTypes.UUID, allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },

      ledger: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "customer",
        validate: { isIn: [["customer", "expense"]] },
      },
      entry_type: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [["debit", "credit"]] },
      },
      category: { type: DataTypes.STRING(50), allowNull: true },

      description: { type: DataTypes.STRING(255), allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      entry_date: { type: DataTypes.DATEONLY, allowNull: false },

      payment_method: { type: DataTypes.STRING(50), allowNull: true },
      reference_number: { type: DataTypes.STRING(50), allowNull: true },
      is_personal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      notes: { type: DataTypes.STRING(500), allowNull: true },

      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "job_ledger_entry",
      modelName: "JobLedgerEntry",
      underscored: true,
    }
  );
  return JobLedgerEntry;
};
