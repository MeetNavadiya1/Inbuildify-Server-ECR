import { Model, DataTypes } from "sequelize";

export class JobTask extends Model {
  static associate(models) {
    JobTask.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobTask.belongsTo(models.JobSubStage, { foreignKey: "sub_stage_id", as: "subStage", onDelete: "CASCADE" });
    JobTask.belongsTo(models.DocumentCommonFolder, { foreignKey: "folder_id", as: "folder", onDelete: "SET NULL" });
    // `assignee` is the ROLE the task belongs to; `assigneeUser` is the person.
    // The role drives the task-visibility filter and narrows the user list the
    // assignee is picked from — see job-process-task.service.resolveAssigneeUser.
    JobTask.belongsTo(models.Role, { foreignKey: "assignee_id", as: "assignee", onDelete: "SET NULL" });
    JobTask.belongsTo(models.Users, { foreignKey: "assignee_user_id", as: "assigneeUser", onDelete: "SET NULL" });
    // `service` is WHAT the task is; `supplier` is WHO is doing it. This is the
    // pair the workflow UI collects — see job-process-task.service.resolveServiceSupplier.
    JobTask.belongsTo(models.Service, { foreignKey: "service_id", as: "service", onDelete: "SET NULL" });
    JobTask.belongsTo(models.Supplier, { foreignKey: "supplier_id", as: "supplier", onDelete: "SET NULL" });
    JobTask.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobTask.hasMany(models.JobSubtask, { foreignKey: "job_process_task_id", as: "subtasks" });
    JobTask.hasMany(models.JobTaskDependency, { foreignKey: "task_id", as: "taskDependencies" });
  }
}

export default (sequelize) => {
  JobTask.init(
    {
      job_process_task_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      job_id: { type: DataTypes.UUID, allowNull: false },
      sub_stage_id: { type: DataTypes.UUID, allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
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
      // Per-job sync flag, cascaded from its stage's sync toggle. Un-synced
      // tasks are excluded from the active job workflow but retain their data.
      is_synced: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      actual_date: { type: DataTypes.DATEONLY, allowNull: true },
      // Derived workflow schedule. Recomputed from the task chain (see
      // workflowSchedule.service.js) whenever the workflow is read or mutated,
      // honouring the Job → Workflow settings (weekends, holidays, propagation).
      estimated_start_date: { type: DataTypes.DATEONLY, allowNull: true },
      estimated_end_date: { type: DataTypes.DATEONLY, allowNull: true },
      // The end date was set by hand — the recalculation keeps it as-is.
      estimated_date_locked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // The chain has been shifted onto this task's actual date. Set
      // automatically when the "recalculate on actual date changes" setting is
      // on, otherwise only once the user confirms the shift.
      actual_date_applied: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      attachments: { type: DataTypes.JSONB, allowNull: true },
      // Who added the task. Keeps it visible to its creator when "Show all
      // Tasks to all Roles" is off and it was assigned to another role.
      created_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_task", modelName: "JobTask", underscored: true },
  );
  return JobTask;
};
