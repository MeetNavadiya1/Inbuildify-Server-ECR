import { Model, DataTypes } from "sequelize";

export class JobProcessStageFunctionality extends Model {
  static associate(models) {}
}
export default (sequelize) => {
  JobProcessStageFunctionality.init({
    functionality_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    is_workflow: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, { sequelize, tableName: "job_process_stage_functionality", modelName: "JobProcessStageFunctionality", underscored: true, timestamps: false });
  return JobProcessStageFunctionality;
};
