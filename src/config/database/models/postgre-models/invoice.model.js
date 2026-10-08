import { Model, DataTypes } from "sequelize";

export class Invoice extends Model {
  static associate(models) {
    Invoice.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  Invoice.init(
    {
      invoice_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      leads_id: { type: DataTypes.UUID, allowNull: true },
      reference_number: { type: DataTypes.STRING(30), allowNull: true },
      generate_invoice: { type: DataTypes.BOOLEAN, defaultValue: false },
      invoice_date: { type: DataTypes.DATEONLY, allowNull: true },
      due_date: { type: DataTypes.DATEONLY, allowNull: true },
      invoice_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      deposite_date: { type: DataTypes.DATEONLY, allowNull: true },
      deposite_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      payment_method: { type: DataTypes.STRING(50), allowNull: true },
      transaction_no: { type: DataTypes.STRING(20), allowNull: true },
      description: { type: DataTypes.STRING(500), allowNull: true },
      status: { type: DataTypes.STRING(100), allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "invoice", modelName: "Invoice", underscored: true },
  );
  return Invoice;
};
