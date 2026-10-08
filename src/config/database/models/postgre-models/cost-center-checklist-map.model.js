import { Model, DataTypes } from "sequelize";

export class CostCenterChecklistMap extends Model {
  static associate(models) {
    CostCenterChecklistMap.belongsTo(models.CostCenter, { foreignKey: "cost_center_id", as: "costCenter", onDelete: "CASCADE" });
    CostCenterChecklistMap.belongsTo(models.ConstructionChecklist, { foreignKey: "construction_checklist_id", as: "constructionChecklist", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  CostCenterChecklistMap.init({
    id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    cost_center_id: { type: DataTypes.UUID, allowNull: false },
    construction_checklist_id: { type: DataTypes.UUID, allowNull: false },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    createdAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "cost_center_checklist_map", modelName: "CostCenterChecklistMap", underscored: true, updatedAt: false });
  return CostCenterChecklistMap;
};
