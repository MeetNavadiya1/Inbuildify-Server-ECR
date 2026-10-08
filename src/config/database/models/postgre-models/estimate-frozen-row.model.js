import { Model, DataTypes } from "sequelize";

/**
 * One estimation row, as it stood when an admin chose NOT to apply a change to
 * existing jobs. See the migration for the whole scheme.
 *
 * `snapshot` is the plain row (DECIMALs already numbers), or NULL meaning "this
 * row did not exist for you" — how a newly added material is kept off jobs that
 * predate it. `row_id` has no association to the live row on purpose: a frozen
 * row must survive the deletion of the row it was copied from.
 */
export class EstimateFrozenRow extends Model {
  static associate(models) {
    EstimateFrozenRow.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "SET NULL" });
    EstimateFrozenRow.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "SET NULL" });
    EstimateFrozenRow.hasMany(models.EstimateJobFrozenRow, {
      foreignKey: "frozen_row_id",
      as: "pins",
      onDelete: "CASCADE",
    });
  }
}

export default (sequelize) => {
  EstimateFrozenRow.init(
    {
      frozen_row_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },

      kind: { type: DataTypes.STRING(20), allowNull: false },
      row_id: { type: DataTypes.UUID, allowNull: false },
      snapshot: { type: DataTypes.JSONB, allowNull: true },
      reason: { type: DataTypes.STRING(120), allowNull: true },

      created_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "estimate_frozen_row",
      modelName: "EstimateFrozenRow",
      underscored: true,
    },
  );
  return EstimateFrozenRow;
};
