import { Model, DataTypes } from "sequelize";

export class WorkflowProcess extends Model {
  static associate(models) {
    WorkflowProcess.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder" });
    WorkflowProcess.hasMany(models.WorkflowProcessTask, { foreignKey: "workflow_process_id", as: "tasks" });
  }
}

export default (sequelize) => {
  WorkflowProcess.init(
    {
      workflow_process_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      builder_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      display_order: { type: DataTypes.INTEGER, allowNull: false },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "workflow_process", modelName: "WorkflowProcess", underscored: true },
  );
  return WorkflowProcess;
};
