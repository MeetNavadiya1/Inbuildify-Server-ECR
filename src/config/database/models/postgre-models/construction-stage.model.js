import { Model, DataTypes } from "sequelize";

export class ConstructionStage extends Model {
  static associate(models) {
    ConstructionStage.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ConstructionStage.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builderRef", onDelete: "CASCADE" });
    ConstructionStage.belongsTo(models.ConstructionType, { foreignKey: "construction_type_id", as: "constructionType", onDelete: "CASCADE" });
    ConstructionStage.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ConstructionStage.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  ConstructionStage.init({
    construction_stage: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    builder: { type: DataTypes.UUID, allowNull: true },
    construction_type_id: { type: DataTypes.UUID, allowNull: true },
    stage_name: { type: DataTypes.STRING(255), allowNull: false },
    // Workflow this stage belongs to: PRE_CONSTRUCTION | CONSTRUCTION
    workflow_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "CONSTRUCTION" },
    days: { type: DataTypes.INTEGER, defaultValue: 10 },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 1 },
    site_image: { type: DataTypes.BOOLEAN, defaultValue: false },
    inspection: { type: DataTypes.STRING(100), defaultValue: "not_required" },
    bg_color: { type: DataTypes.STRING(50), allowNull: true },
    font_color: { type: DataTypes.STRING(50), allowNull: true },
    // Optional icon name/key for the stage.
    icon: { type: DataTypes.STRING(100), allowNull: true },
    // Catalog stage on/off: active | inactive
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "active" },
    // True for seeded default stages.
    is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "construction_stage", modelName: "ConstructionStage", underscored: true });
  return ConstructionStage;
};
