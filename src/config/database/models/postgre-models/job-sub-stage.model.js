import { Model, DataTypes } from "sequelize";

export class JobSubStage extends Model {
  static associate(models) {
    JobSubStage.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobSubStage.belongsTo(models.JobProcessStage, { foreignKey: "stage_id", as: "stage", onDelete: "CASCADE" });
    JobSubStage.hasMany(models.JobTask, { foreignKey: "sub_stage_id", as: "tasks" });
  }
}

export default (sequelize) => {
  JobSubStage.init(
    {
      sub_stage_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      job_id: { type: DataTypes.UUID, allowNull: false },
      stage_id: { type: DataTypes.UUID, allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false },
      is_completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_skipped: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Per-job sync flag. Un-syncing a stage cascades this to false for all its
      // sub-stages (and their tasks) in this job, excluding them from the active
      // workflow while keeping the rows so the action is reversible.
      is_synced: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_sub_stage", modelName: "JobSubStage", underscored: true },
  );
  return JobSubStage;
};
