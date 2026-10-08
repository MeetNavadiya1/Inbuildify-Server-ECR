import { Model, DataTypes } from "sequelize";

export class DocumentFileNamingFormat extends Model {
  static associate(models) {
    DocumentFileNamingFormat.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    DocumentFileNamingFormat.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    DocumentFileNamingFormat.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    DocumentFileNamingFormat.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  DocumentFileNamingFormat.init(
    {
      document_file_naming_format_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      naming_format: { type: DataTypes.STRING(255), allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "document_file_naming_format", modelName: "DocumentFileNamingFormat", underscored: true },
  );
  return DocumentFileNamingFormat;
};
