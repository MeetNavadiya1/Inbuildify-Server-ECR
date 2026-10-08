import { Model, DataTypes } from "sequelize";

export class JobProcessTask extends Model {
  static associate(models) {
    JobProcessTask.belongsTo(models.JobProcessSubStage, { foreignKey: "sub_stage_id", as: "subStage", onDelete: "CASCADE" });
    JobProcessTask.belongsTo(models.DocumentCommonFolder, { foreignKey: "folder_id", as: "folder", onDelete: "SET NULL" });
    // `assignee` is the ROLE the task belongs to; `assigneeUser` is the person.
    // The role drives the task-visibility filter and narrows the user list the
    // assignee is picked from — see job-process-task.service.resolveAssigneeUser.
    JobProcessTask.belongsTo(models.Role, { foreignKey: "assignee_id", as: "assignee", onDelete: "SET NULL" });
    JobProcessTask.belongsTo(models.Users, { foreignKey: "assignee_user_id", as: "assigneeUser", onDelete: "SET NULL" });
    // `service` is WHAT the task is; `supplier` is WHO is doing it. This is the
    // pair the workflow UI collects — see job-process-task.service.resolveServiceSupplier.
    JobProcessTask.belongsTo(models.Service, { foreignKey: "service_id", as: "service", onDelete: "SET NULL" });
    JobProcessTask.belongsTo(models.Supplier, { foreignKey: "supplier_id", as: "supplier", onDelete: "SET NULL" });
    JobProcessTask.hasMany(models.JobProcessSubtask, { foreignKey: "job_process_task_id", as: "subtasks" });
    JobProcessTask.hasMany(models.JobProcessTaskDependency, { foreignKey: "task_id", as: "taskDependencies" });
  }
}

export default (sequelize) => {
  JobProcessTask.init(
    {
      job_process_task_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      sub_stage_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false },
      folder_id: { type: DataTypes.UUID, allowNull: true },
      no_of_days: { type: DataTypes.INTEGER, allowNull: true },
      assignee_id: { type: DataTypes.UUID, allowNull: true },
      assignee_user_id: { type: DataTypes.UUID, allowNull: true },
      service_id: { type: DataTypes.UUID, allowNull: true },
      supplier_id: { type: DataTypes.UUID, allowNull: true },
      notify: { type: DataTypes.BOOLEAN, defaultValue: false },
      milestone: { type: DataTypes.BOOLEAN, defaultValue: false },
      attachment_mandatory: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Whether this template task is cloned into a job's instance tables.
      is_synced: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      actual_date: { type: DataTypes.DATEONLY, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      attachments: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_process_task", modelName: "JobProcessTask", underscored: true },
  );
  return JobProcessTask;
};
