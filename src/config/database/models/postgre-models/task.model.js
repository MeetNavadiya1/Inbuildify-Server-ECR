import { Model, DataTypes } from "sequelize";

export class Task extends Model {
  static associate(models) {
    Task.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Task.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Task.belongsTo(models.Users, { foreignKey: "assignee_id", as: "assignee", onDelete: "SET NULL" });
    Task.belongsTo(models.Users, { foreignKey: "link_to", as: "linkedUser", onDelete: "SET NULL" });
    Task.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Task.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Task.belongsTo(models.Leads, { foreignKey: "lead_id", as: "lead", onDelete: "SET NULL" });
    Task.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  Task.init({
    task_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    due_date: { type: DataTypes.DATEONLY, allowNull: true },
    due_time: { type: DataTypes.TIME, allowNull: true },
    assignee_id: { type: DataTypes.UUID, allowNull: true },
    link_to: { type: DataTypes.UUID, allowNull: true },
    link_type: { type: DataTypes.STRING(255), allowNull: true },
    lead_id: { type: DataTypes.UUID, allowNull: true },
    // When set, this task belongs to a job's Action timeline (not the lead's).
    job_id: { type: DataTypes.UUID, allowNull: true },
    priority: { type: DataTypes.STRING(20), defaultValue: "Medium" },
    status: { type: DataTypes.STRING(20), defaultValue: "Yet to Start" },
    is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    attach_files: { type: DataTypes.STRING(500), allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    // Whose sample data this row is. Scopes Settings → Sample Data to one
    // account: every user under a company shares its builder_id.
    sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "task", modelName: "Task", underscored: true });
  return Task;
};
