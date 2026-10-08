import { Model, DataTypes } from "sequelize";

export class JobProcessSubtask extends Model {
  static associate(models) {
    JobProcessSubtask.belongsTo(models.JobProcessTask, { foreignKey: "job_process_task_id", as: "jobProcessTask", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  JobProcessSubtask.init({
    job_process_subtask_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    job_process_task_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "job_process_subtask", modelName: "JobProcessSubtask", underscored: true, updatedAt: false });
  return JobProcessSubtask;
};
