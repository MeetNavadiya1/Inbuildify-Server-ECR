import { Model, DataTypes } from "sequelize";

export class Maintenance extends Model {
  static associate(models) {
    Maintenance.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    Maintenance.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "SET NULL" });
    Maintenance.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "SET NULL" });
    Maintenance.belongsTo(models.Users, { foreignKey: "supervisor_id", as: "supervisor", onDelete: "SET NULL" });
    Maintenance.belongsTo(models.Users, { foreignKey: "customer_contact_id", as: "customerContact", onDelete: "SET NULL" });
    Maintenance.hasMany(models.MaintenanceRequest, { foreignKey: "maintenance_id", as: "requests", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  Maintenance.init(
    {
      maintenance_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      job_id: { type: DataTypes.UUID, allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      supervisor_id: { type: DataTypes.UUID, allowNull: true },
      customer_contact_id: { type: DataTypes.UUID, allowNull: true },
      // App-level enum, kept free-text like Job.status: readyformaintenance / undermaintenance / completed
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "readyformaintenance" },
      pci_date: { type: DataTypes.DATEONLY, allowNull: true },
      occupancy_permit_date: { type: DataTypes.DATEONLY, allowNull: true },
      handover_date: { type: DataTypes.DATEONLY, allowNull: true },
      // Atomic counter used to generate MR{n} reference numbers without gaps/races.
      request_sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal("CURRENT_TIMESTAMP") },
    },
    { sequelize, tableName: "maintenance", modelName: "Maintenance", underscored: true },
  );
  return Maintenance;
};
