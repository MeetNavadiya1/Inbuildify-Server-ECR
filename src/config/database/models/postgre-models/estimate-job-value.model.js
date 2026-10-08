import { Model, DataTypes } from "sequelize";

/**
 * One parameter's value on one job (Job → Estimate & Dashboard).
 *
 * The formulas and unit prices are the builder's, shared by every job; this is
 * the part that is the job's own — the area, the bedroom count, the ceiling
 * height it was priced with. A parameter with no row here falls back to its own
 * default, so a job opened for the first time still prices straight away.
 */
export class EstimateJobValue extends Model {
  static associate(models) {
    EstimateJobValue.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    EstimateJobValue.belongsTo(models.EstimateParameter, {
      foreignKey: "estimate_parameter_id",
      as: "parameter",
      onDelete: "CASCADE",
    });
    EstimateJobValue.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "SET NULL" });
    EstimateJobValue.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  EstimateJobValue.init(
    {
      estimate_job_value_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },

      job_id: { type: DataTypes.UUID, allowNull: false },
      estimate_parameter_id: { type: DataTypes.UUID, allowNull: false },
      value: { type: DataTypes.DECIMAL(18, 4), allowNull: false },

      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "estimate_job_value",
      modelName: "EstimateJobValue",
      underscored: true,
    },
  );
  return EstimateJobValue;
};
