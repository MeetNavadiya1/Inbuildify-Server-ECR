import { Model, DataTypes } from "sequelize";

export class Opportunity extends Model {
  static associate(models) {
    Opportunity.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead", onDelete: "CASCADE" });
    Opportunity.hasMany(models.Job, { foreignKey: "opportunity_id", as: "jobs" });
  }
}

export default (sequelize) => {
  Opportunity.init(
    {
      opportunity_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      leads_id: { type: DataTypes.UUID, allowNull: true },
      opportunity_notes: { type: DataTypes.STRING(1000), allowNull: true },
      status: { type: DataTypes.STRING(252), allowNull: true },
      out_come: { type: DataTypes.STRING(10), allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "opportunity", modelName: "Opportunity", underscored: true },
  );
  return Opportunity;
};
