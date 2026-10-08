import { Model, DataTypes } from "sequelize";

export class FloorPlanFacadeMap extends Model {
  static associate(models) {
    FloorPlanFacadeMap.belongsTo(models.FloorPlan, { foreignKey: "floor_plan_id", as: "floorPlan", onDelete: "CASCADE" });
    FloorPlanFacadeMap.belongsTo(models.Facade, { foreignKey: "facade_id", as: "facade", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  FloorPlanFacadeMap.init(
    {
      id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      floor_plan_id: { type: DataTypes.UUID, allowNull: true },
      facade_id: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "floor_plan_facade_map", modelName: "FloorPlanFacadeMap", underscored: true },
  );
  return FloorPlanFacadeMap;
};
