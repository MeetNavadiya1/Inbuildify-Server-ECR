import { Model, DataTypes } from "sequelize";

export class ColorGroupItemMap extends Model {
  static associate(models) {
    ColorGroupItemMap.belongsTo(models.ColorGroup, { foreignKey: "color_group_id", as: "colorGroup", onDelete: "CASCADE" });
    ColorGroupItemMap.belongsTo(models.ColorItem, { foreignKey: "color_item_id", as: "colorItem", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  ColorGroupItemMap.init(
    {
      id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      color_group_id: { type: DataTypes.UUID, allowNull: true },
      color_item_id: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: "color_group_item_map", modelName: "ColorGroupItemMap", underscored: true },
  );
  return ColorGroupItemMap;
};
