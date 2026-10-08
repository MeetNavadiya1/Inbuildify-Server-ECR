import { Model, DataTypes } from "sequelize";

export class MaintenanceRequestTask extends Model {
  static associate(models) {
    MaintenanceRequestTask.belongsTo(models.MaintenanceRequest, { foreignKey: "maintenance_request_id", as: "request", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  MaintenanceRequestTask.init(
    {
      maintenance_request_task_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      maintenance_request_id: { type: DataTypes.UUID, allowNull: false },
      title: { type: DataTypes.STRING(500), allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      is_completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal("CURRENT_TIMESTAMP") },
    },
    { sequelize, tableName: "maintenance_request_task", modelName: "MaintenanceRequestTask", underscored: true },
  );
  return MaintenanceRequestTask;
};
