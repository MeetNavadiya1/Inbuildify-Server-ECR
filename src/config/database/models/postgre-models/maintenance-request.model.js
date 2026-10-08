import { Model, DataTypes } from "sequelize";

export class MaintenanceRequest extends Model {
  static associate(models) {
    MaintenanceRequest.belongsTo(models.Maintenance, { foreignKey: "maintenance_id", as: "maintenance", onDelete: "CASCADE" });
    MaintenanceRequest.hasMany(models.MaintenanceRequestTask, { foreignKey: "maintenance_request_id", as: "tasks", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  MaintenanceRequest.init(
    {
      maintenance_request_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      maintenance_id: { type: DataTypes.UUID, allowNull: false },
      reference_number: { type: DataTypes.STRING(40), allowNull: false },
      supplier: { type: DataTypes.STRING(255), allowNull: true },
      start_date: { type: DataTypes.DATEONLY, allowNull: true },
      finish_date: { type: DataTypes.DATEONLY, allowNull: true },
      complete_date: { type: DataTypes.DATEONLY, allowNull: true },
      // Pending / On Hold / Completed
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Pending" },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      notes: { type: DataTypes.TEXT, allowNull: true },
      attach_file: { type: DataTypes.STRING(500), allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal("CURRENT_TIMESTAMP") },
    },
    { sequelize, tableName: "maintenance_request", modelName: "MaintenanceRequest", underscored: true },
  );
  return MaintenanceRequest;
};
