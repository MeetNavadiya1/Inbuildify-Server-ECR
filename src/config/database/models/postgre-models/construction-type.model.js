import { Model, DataTypes } from "sequelize";

export class ConstructionType extends Model {
  static associate(models) {
    ConstructionType.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ConstructionType.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builderRef", onDelete: "CASCADE" }); // ← changed
    ConstructionType.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ConstructionType.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    ConstructionType.hasMany(models.ConstructionStage, { foreignKey: "construction_type_id", as: "stages" });
    ConstructionType.hasMany(models.ConstructionChecklist, { foreignKey: "construction_type_id", as: "checklists" });
  }
}

export default (sequelize) => {
  ConstructionType.init(
    {
      construction_type_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      builder: { type: DataTypes.UUID, allowNull: true },
      types_name: { type: DataTypes.STRING(255), allowNull: false },
      start_construction_days: { type: DataTypes.INTEGER, defaultValue: 21 },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 1 },
      dwelling_type: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "construction_type",
      modelName: "ConstructionType",
      underscored: true,
    },
  );
  return ConstructionType;
};
