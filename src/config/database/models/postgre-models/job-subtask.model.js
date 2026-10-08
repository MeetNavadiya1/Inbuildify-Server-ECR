import { Model, DataTypes } from "sequelize";

export class JobSubtask extends Model {
  static associate(models) {
    JobSubtask.belongsTo(models.JobTask, { foreignKey: "job_process_task_id", as: "jobProcessTask", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  JobSubtask.init({
    job_process_subtask_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    job_id: { type: DataTypes.UUID, allowNull: true },
    job_process_task_id: { type: DataTypes.UUID, allowNull: false },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: false },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    createdAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "job_subtask", modelName: "JobSubtask", underscored: true, updatedAt: false });
  return JobSubtask;
};
