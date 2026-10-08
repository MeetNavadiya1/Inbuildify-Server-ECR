import { Model, DataTypes } from "sequelize";

export class JobCommissionSubStage extends Model {
  static associate(models) {
    JobCommissionSubStage.belongsTo(models.JobCommission, { foreignKey: "job_commission_id", as: "jobCommission", onDelete: "CASCADE" });
    JobCommissionSubStage.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobCommissionSubStage.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  JobCommissionSubStage.init({
    job_commission_sub_stage_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    job_commission_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    commission_unit: { type: DataTypes.ENUM("percentage", "amount"), allowNull: false },
    commission_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "job_commission_sub_stage", modelName: "JobCommissionSubStage", underscored: true });
  return JobCommissionSubStage;
};
