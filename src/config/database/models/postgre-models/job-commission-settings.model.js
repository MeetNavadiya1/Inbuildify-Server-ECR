import { Model, DataTypes } from "sequelize";

export class JobCommissionSettings extends Model {
  static associate(models) {
    JobCommissionSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobCommissionSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobCommissionSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobCommissionSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    JobCommissionSettings.hasMany(models.JobCommission, { foreignKey: "job_commission_settings_id", as: "commissions" });
  }
}

export default (sequelize) => {
  JobCommissionSettings.init(
    {
      job_commission_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      define_outgoing_commission: { type: DataTypes.BOOLEAN, defaultValue: false },
      define_incoming_commission: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_commission_settings", modelName: "JobCommissionSettings", underscored: true },
  );
  return JobCommissionSettings;
};
