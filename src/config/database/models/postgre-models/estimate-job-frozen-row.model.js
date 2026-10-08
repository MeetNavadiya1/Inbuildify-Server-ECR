import { Model, DataTypes } from "sequelize";

/**
 * Which jobs are held at a frozen estimation row.
 *
 * Written once per job at the moment an admin declines to apply a change, so
 * the set is exactly "the jobs that existed then" — a job created afterwards
 * has no pin and is priced from the live settings, which is the point.
 */
export class EstimateJobFrozenRow extends Model {
  static associate(models) {
    EstimateJobFrozenRow.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    EstimateJobFrozenRow.belongsTo(models.EstimateFrozenRow, {
      foreignKey: "frozen_row_id",
      as: "frozenRow",
      onDelete: "CASCADE",
    });
  }
}

export default (sequelize) => {
  EstimateJobFrozenRow.init(
    {
      job_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
      frozen_row_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
      createdAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "estimate_job_frozen_row",
      modelName: "EstimateJobFrozenRow",
      underscored: true,
      timestamps: true,
      updatedAt: false,
    },
  );
  return EstimateJobFrozenRow;
};
