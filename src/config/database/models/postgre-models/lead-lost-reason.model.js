import { Model, DataTypes } from "sequelize";

export class LeadLostReason extends Model {
  static associate(models) {
    LeadLostReason.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    LeadLostReason.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    LeadLostReason.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    LeadLostReason.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  LeadLostReason.init(
    {
      lead_lost_reason_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      lost_reason: { type: DataTypes.STRING(255), allowNull: false },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 1 },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "lead_lost_reason", modelName: "LeadLostReason", underscored: true },
  );
  return LeadLostReason;
};
