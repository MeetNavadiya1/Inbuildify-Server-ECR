import { Model, DataTypes } from "sequelize";

export class ConstructionChecklist extends Model {
  static associate(models) {
    ConstructionChecklist.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ConstructionChecklist.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builderRef", onDelete: "CASCADE" });
    ConstructionChecklist.belongsTo(models.ConstructionType, { foreignKey: "construction_type_id", as: "constructionType", onDelete: "CASCADE" });
    ConstructionChecklist.belongsTo(models.ConstructionStage, { foreignKey: "construction_stage_id", as: "constructionStage", onDelete: "CASCADE" });
    ConstructionChecklist.belongsTo(models.ComplianceType, { foreignKey: "compliance_type_id", as: "complianceType", onDelete: "SET NULL" });
    ConstructionChecklist.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ConstructionChecklist.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    ConstructionChecklist.hasMany(models.ConstructionChecklistPredecessor, { foreignKey: "construction_checklist_id", as: "predecessors" });
    ConstructionChecklist.hasMany(models.ConstructionSubChecklist, { foreignKey: "construction_checklist_id", as: "subChecklists" });
    ConstructionChecklist.hasMany(models.CostCenterChecklistMap, { foreignKey: "construction_checklist_id", as: "costCenterMaps" });
    ConstructionChecklist.belongsTo(models.Builder, { foreignKey: "builder", as: "builderDetail", onDelete: "CASCADE" });
    ConstructionChecklist.belongsTo(models.SupplierType, { foreignKey: "supplier_type_id", as: "supplierType", onDelete: "SET NULL" });
    ConstructionChecklist.belongsTo(models.DocumentCommonFolder, { foreignKey: "po_folder_id", as: "poFolder", onDelete: "SET NULL" });
    ConstructionChecklist.belongsTo(models.DocumentCommonFolder, { foreignKey: "job_documents_folder_id", as: "jobDocumentFolder", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  ConstructionChecklist.init(
    {
      construction_checklist_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      builder: { type: DataTypes.UUID, allowNull: true },
      construction_type_id: { type: DataTypes.UUID, allowNull: true },
      construction_stage_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      supplier_type_id: { type: DataTypes.UUID, allowNull: true },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 1 },
      data_required: { type: DataTypes.BOOLEAN, defaultValue: true },
      supplier: { type: DataTypes.BOOLEAN, defaultValue: true },
      claim: { type: DataTypes.BOOLEAN, defaultValue: false },
      dependent: { type: DataTypes.BOOLEAN, defaultValue: false },
      no_of_days: { type: DataTypes.INTEGER, defaultValue: 1 },
      notify: { type: DataTypes.BOOLEAN, defaultValue: false },
      milestone: { type: DataTypes.BOOLEAN, defaultValue: false },
      attachment_mandatory: { type: DataTypes.BOOLEAN, defaultValue: false },
      attachment_mandatory_name: { type: DataTypes.STRING(255), allowNull: true },
      cost_center_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      construction_option_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      compliance_type_id: { type: DataTypes.UUID, allowNull: true },
      po_folder_id: { type: DataTypes.UUID, allowNull: true },
      job_documents_folder_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "construction_checklist",
      modelName: "ConstructionChecklist",
      underscored: true,
    },
  );
  return ConstructionChecklist;
};
