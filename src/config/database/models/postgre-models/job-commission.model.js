import { Model, DataTypes } from "sequelize";

export class JobCommission extends Model {
  static associate(models) {
    JobCommission.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobCommission.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobCommission.belongsTo(models.JobCommissionSettings, { foreignKey: "job_commission_settings_id", as: "commissionSettings", onDelete: "CASCADE" });
    JobCommission.belongsTo(models.Users, { foreignKey: "recipient_user_id", as: "recipientUser", onDelete: "SET NULL" });
    JobCommission.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobCommission.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    JobCommission.hasMany(models.JobCommissionSubStage, { foreignKey: "job_commission_id", as: "subStages" });
  }
}
export default (sequelize) => {
  JobCommission.init({
    job_commission_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    job_commission_settings_id: { type: DataTypes.UUID, allowNull: true },
    commission_type: { type: DataTypes.ENUM("outgoing", "incoming"), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    recipient: { type: DataTypes.ENUM("sales_person", "reporting_to", "referral_partner", "customer", "other_user"), allowNull: true },
    recipient_user_id: { type: DataTypes.UUID, allowNull: true },
    commission_unit: { type: DataTypes.ENUM("percentage", "amount"), allowNull: false },
    commission_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "job_commission", modelName: "JobCommission", underscored: true });
  return JobCommission;
};
