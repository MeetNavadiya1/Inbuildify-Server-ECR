import { Model, DataTypes } from "sequelize";

export class JobProcessTaskDependency extends Model {
  static associate(models) {
    JobProcessTaskDependency.belongsTo(models.JobProcessTask, { foreignKey: "task_id", as: "task", onDelete: "CASCADE" });
    JobProcessTaskDependency.belongsTo(models.JobProcessTask, { foreignKey: "predecessor_task_id", as: "predecessorTask", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  JobProcessTaskDependency.init({
    task_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true,
      defaultValue: sequelize.literal("gen_random_uuid()"),
    },
    predecessor_task_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
  }, { sequelize, tableName: "job_process_task_dependency", modelName: "JobProcessTaskDependency", underscored: true, timestamps: false });
  return JobProcessTaskDependency;
};
