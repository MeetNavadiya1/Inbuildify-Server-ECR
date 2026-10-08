import { Model, DataTypes } from "sequelize";

/**
 * An input to the builder's estimate (Admin → Estimation → Parameters) —
 * "Total Built-up Area (m²)", "Bedrooms", "Project Type"…
 *
 * `variable` is the name material formulas use to refer to it
 * (`total_area * 1.3`). Unique per tenant ACROSS parameters and materials,
 * because both live in the same formula namespace (see estimate.service.js).
 *
 * `input_type`:
 *   - number   — a free numeric input
 *   - select   — a dropdown; `options` is [{ label, value }] and the chosen
 *                option's numeric `value` is what formulas see
 *                (Single Storey = 1, Double Storey = 2)
 *   - boolean  — Yes/No, seen by formulas as 1/0
 *   - formula  — not an input at all: computed from other parameters by
 *                `formula`, so shared intermediate figures (wall volume,
 *                concrete volume) are written once instead of in every material
 */
export class EstimateParameter extends Model {
  static associate(models) {
    EstimateParameter.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    EstimateParameter.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  EstimateParameter.init(
    {
      estimate_parameter_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },

      label: { type: DataTypes.STRING(120), allowNull: false },
      variable: { type: DataTypes.STRING(60), allowNull: false },
      input_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "number" },
      unit: { type: DataTypes.STRING(30), allowNull: true },
      options: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      default_value: { type: DataTypes.DECIMAL(18, 4), allowNull: true },
      formula: { type: DataTypes.TEXT, allowNull: true },
      description: { type: DataTypes.STRING(500), allowNull: true },

      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "estimate_parameter",
      modelName: "EstimateParameter",
      underscored: true,
    },
  );
  return EstimateParameter;
};
