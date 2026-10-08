import { Model, DataTypes } from "sequelize";

export class ConstructionChecklistPredecessor extends Model {
  static associate(models) {
    ConstructionChecklistPredecessor.belongsTo(models.ConstructionChecklist, { foreignKey: "construction_checklist_id", as: "constructionChecklist", onDelete: "CASCADE" });
    ConstructionChecklistPredecessor.belongsTo(models.ConstructionChecklist, { foreignKey: "predecessor_checklist_id", as: "predecessorChecklist", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  ConstructionChecklistPredecessor.init(
    {
      construction_checklist_predecessor_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      construction_checklist_id: { type: DataTypes.UUID, allowNull: false },
      predecessor_checklist_id: { type: DataTypes.UUID, allowNull: true },
      off_set: { type: DataTypes.BOOLEAN, defaultValue: false },
      duration: { type: DataTypes.INTEGER, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "construction_checklist_predecessor",
      modelName: "ConstructionChecklistPredecessor",
      underscored: true,
    },
  );
  return ConstructionChecklistPredecessor;
};
