import { Model, DataTypes } from "sequelize";

export class ChecklistItem extends Model {
  static associate(models) {
    ChecklistItem.belongsTo(models.Checklist, { foreignKey: "checklist_id", as: "checklist", onDelete: "CASCADE" });
    ChecklistItem.belongsTo(models.ConstructionType, { foreignKey: "construction_type_id", as: "constructionType", onDelete: "CASCADE" });
    ChecklistItem.belongsTo(models.ConstructionStage, { foreignKey: "construction_stage_id", as: "constructionStage", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  ChecklistItem.init({
    checklist_item_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    checklist_id: { type: DataTypes.UUID, allowNull: false },
    construction_type_id: { type: DataTypes.UUID, allowNull: true },
    construction_stage_id: { type: DataTypes.UUID, allowNull: true },
    description: { type: DataTypes.STRING(500), allowNull: false },
    notes: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_required: { type: DataTypes.BOOLEAN, defaultValue: false },
    type: { type: DataTypes.ENUM("checkbox", "dropdown"), allowNull: false },
    sort: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "checklist_item", modelName: "ChecklistItem", underscored: true });
  return ChecklistItem;
};
