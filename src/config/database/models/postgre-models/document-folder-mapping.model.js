import { Model, DataTypes } from "sequelize";

export class DocumentFolderMapping extends Model {
  static associate(models) {
    DocumentFolderMapping.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    DocumentFolderMapping.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    DocumentFolderMapping.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    DocumentFolderMapping.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  DocumentFolderMapping.init(
    {
      document_folder_mapping_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      signed_quotation: { type: DataTypes.UUID, allowNull: true },
      signed_color: { type: DataTypes.UUID, allowNull: true },
      signed_variation: { type: DataTypes.UUID, allowNull: true },
      signed_maintenance: { type: DataTypes.UUID, allowNull: true },
      signed_contract_document: { type: DataTypes.UUID, allowNull: true },
      compliance_certificate: { type: DataTypes.UUID, allowNull: true },
      purchase_order: { type: DataTypes.UUID, allowNull: true },
      job_documents: { type: DataTypes.UUID, allowNull: true },
      select_all_files_from_folder: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "document_folder_mapping", modelName: "DocumentFolderMapping", underscored: true },
  );
  return DocumentFolderMapping;
};
