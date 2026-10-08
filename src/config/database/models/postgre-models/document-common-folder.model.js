import { Model, DataTypes } from "sequelize";

export class DocumentCommonFolder extends Model {
  static associate(models) {
    DocumentCommonFolder.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    DocumentCommonFolder.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    DocumentCommonFolder.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    DocumentCommonFolder.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    DocumentCommonFolder.hasMany(models.DocumentCommonSubfolder, { foreignKey: "document_common_folder_id", as: "subfolders" });
  }
}

export default (sequelize) => {
  DocumentCommonFolder.init(
    {
      document_common_folder_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
      notify: { type: DataTypes.BOOLEAN, defaultValue: false },
      share_to_customer: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_locked: { type: DataTypes.BOOLEAN, defaultValue: false },
      role_ids: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      user_ids: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "document_common_folder", modelName: "DocumentCommonFolder", underscored: true },
  );
  return DocumentCommonFolder;
};
