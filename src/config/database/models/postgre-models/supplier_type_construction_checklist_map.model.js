import { Model, DataTypes } from "sequelize";

export class SupplierTypeConstructionChecklistMap extends Model {
  static associate(models) {
    SupplierTypeConstructionChecklistMap.belongsTo(models.SupplierType, { foreignKey: "supplier_type_id", as: "supplierType", onDelete: "CASCADE" });
    SupplierTypeConstructionChecklistMap.belongsTo(models.ConstructionChecklist, { foreignKey: "construction_checklist_id", as: "constructionChecklist", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  SupplierTypeConstructionChecklistMap.init({
    id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    supplier_type_id: { type: DataTypes.UUID, allowNull: false },
    construction_checklist_id: { type: DataTypes.UUID, allowNull: false },
    createdAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "supplier_type_construction_checklist_map", modelName: "SupplierTypeConstructionChecklistMap", underscored: true, updatedAt: false });
  return SupplierTypeConstructionChecklistMap;
};
