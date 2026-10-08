import { Model, DataTypes } from "sequelize";

/**
 * A line on the builder's estimate (Admin → Estimation → Materials) — "Bricks",
 * "Cement (bags)"…
 *
 * `formula` turns the estimate's parameters into a quantity
 * (`total_area * 1.3`); quantity × `unit_price` is the line's cost. A material's
 * `variable` is itself usable in other formulas, so `sand = cement * 2` works
 * the way it does in a spreadsheet. Evaluation order and cycle detection live
 * in estimate.service.js.
 */
export class EstimateMaterial extends Model {
  static associate(models) {
    EstimateMaterial.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    EstimateMaterial.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  EstimateMaterial.init(
    {
      estimate_material_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },

      name: { type: DataTypes.STRING(120), allowNull: false },
      variable: { type: DataTypes.STRING(60), allowNull: false },
      unit: { type: DataTypes.STRING(30), allowNull: true },
      formula: { type: DataTypes.TEXT, allowNull: false },
      unit_price: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      // The unit price before the last price change; NULL if it never changed.
      previous_unit_price: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
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
      tableName: "estimate_material",
      modelName: "EstimateMaterial",
      underscored: true,
    },
  );
  return EstimateMaterial;
};
