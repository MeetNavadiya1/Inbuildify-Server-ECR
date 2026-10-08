import { Model, DataTypes } from "sequelize";

export class ConstructionSubChecklist extends Model {
  static associate(models) {
    ConstructionSubChecklist.belongsTo(models.ConstructionChecklist, { foreignKey: "construction_checklist_id", as: "constructionChecklist", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  ConstructionSubChecklist.init(
    {
      construction_sub_checklist_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      construction_checklist_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      data_required: { type: DataTypes.BOOLEAN, defaultValue: true },
      no_of_days: { type: DataTypes.INTEGER, defaultValue: 0 },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 1 },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "construction_sub_checklist",
      modelName: "ConstructionSubChecklist",
      underscored: true,
    },
  );
  return ConstructionSubChecklist;
};
