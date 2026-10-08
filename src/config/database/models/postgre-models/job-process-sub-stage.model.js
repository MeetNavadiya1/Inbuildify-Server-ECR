import { Model, DataTypes } from "sequelize";

export class JobProcessSubStage extends Model {
  static associate(models) {
    JobProcessSubStage.belongsTo(models.JobProcessStage, { foreignKey: "stage_id", as: "stage", onDelete: "CASCADE" });
    JobProcessSubStage.hasMany(models.JobProcessTask, { foreignKey: "sub_stage_id", as: "tasks" });
  }
}

export default (sequelize) => {
  JobProcessSubStage.init(
    {
      sub_stage_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      stage_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false },
      is_completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_skipped: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Whether this template sub-stage is cloned into a job's instance tables.
      is_synced: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_process_sub_stage", modelName: "JobProcessSubStage", underscored: true },
  );
  return JobProcessSubStage;
};
