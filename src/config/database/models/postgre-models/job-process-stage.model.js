import { Model, DataTypes } from "sequelize";

export class JobProcessStage extends Model {
  static associate(models) {
    JobProcessStage.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobProcessStage.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobProcessStage.belongsTo(models.JobProcessStage, { foreignKey: "dependent_stage_id", as: "dependentStage", onDelete: "SET NULL" });
    JobProcessStage.hasMany(models.JobProcessSubStage, { foreignKey: "stage_id", as: "subStages" });
    JobProcessStage.belongsTo(models.JobProcessStageFunctionality, { foreignKey: "functionality_id", as: "functionality" });
  }
}

export default (sequelize) => {
  JobProcessStage.init(
    {
      stage_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      functionality_id: { type: DataTypes.UUID, allowNull: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false },
      dependent_stage_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_process_stage", modelName: "JobProcessStage", underscored: true },
  );
  return JobProcessStage;
};
