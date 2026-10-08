import { Model, DataTypes } from "sequelize";

export class WorkflowProcessTask extends Model {
  static associate(models) {
    WorkflowProcessTask.belongsTo(models.WorkflowProcess, { foreignKey: "workflow_process_id", as: "workflowProcess" });
  }
}

export default (sequelize) => {
  WorkflowProcessTask.init(
    {
      workflow_process_task_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      workflow_process_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      attachment: { type: DataTypes.TEXT, allowNull: true },
      timespent: { type: DataTypes.INTEGER, allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "workflow_process_task", modelName: "WorkflowProcessTask", underscored: true },
  );
  return WorkflowProcessTask;
};
