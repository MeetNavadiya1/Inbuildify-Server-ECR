import { Model, DataTypes } from "sequelize";

export class EstateStages extends Model {
  static associate(models) {
    EstateStages.belongsTo(models.Estate, { foreignKey: "estate_id", as: "estate", onDelete: "CASCADE" });
    EstateStages.hasMany(models.Lot, { foreignKey: "estate_stage_id", as: "lots" });
  }
}

export default (sequelize) => {
  EstateStages.init(
    {
      estate_stage_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      estate_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      release_date: { type: DataTypes.DATEONLY, allowNull: true },
      attach_file: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "estate_stages", modelName: "EstateStages", underscored: true },
  );
  return EstateStages;
};
