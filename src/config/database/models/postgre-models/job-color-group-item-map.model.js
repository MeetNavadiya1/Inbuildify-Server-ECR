import { Model, DataTypes } from "sequelize";

export class JobColorGroupItemMap extends Model {
  static associate(models) {
    JobColorGroupItemMap.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobColorGroupItemMap.belongsTo(models.ColorGroup, { foreignKey: "color_group_id", as: "colorGroup", onDelete: "CASCADE" });
    JobColorGroupItemMap.belongsTo(models.JobColorItem, { foreignKey: "color_item_id", as: "colorItem", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  JobColorGroupItemMap.init(
    {
      id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      job_id: { type: DataTypes.UUID, allowNull: false },
      color_group_id: { type: DataTypes.UUID, allowNull: true },
      color_item_id: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: "job_color_group_item_map", modelName: "JobColorGroupItemMap", underscored: true },
  );
  return JobColorGroupItemMap;
};
