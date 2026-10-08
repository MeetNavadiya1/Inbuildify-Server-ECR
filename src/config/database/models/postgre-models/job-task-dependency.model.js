import { Model, DataTypes } from "sequelize";

export class JobTaskDependency extends Model {
  static associate(models) {
    JobTaskDependency.belongsTo(models.JobTask, { foreignKey: "task_id", as: "task", onDelete: "CASCADE" });
    JobTaskDependency.belongsTo(models.JobTask, { foreignKey: "predecessor_task_id", as: "predecessorTask", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  JobTaskDependency.init({
    task_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true,
      defaultValue: sequelize.literal("gen_random_uuid()"),
    },
    predecessor_task_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
  }, { sequelize, tableName: "job_task_dependency", modelName: "JobTaskDependency", underscored: true, timestamps: false });
  return JobTaskDependency;
};
