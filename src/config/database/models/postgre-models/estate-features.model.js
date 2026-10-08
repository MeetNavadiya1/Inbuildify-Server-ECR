import { Model, DataTypes } from "sequelize";

export class EstateFeatures extends Model {
  static associate(models) {
    EstateFeatures.belongsTo(models.Estate, { foreignKey: "estate_id", as: "estate", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  EstateFeatures.init(
    {
      estate_feature_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      estate_id: { type: DataTypes.UUID, allowNull: true },
      feature_name: { type: DataTypes.STRING(255), allowNull: false },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "estate_features", modelName: "EstateFeatures", underscored: true },
  );
  return EstateFeatures;
};
