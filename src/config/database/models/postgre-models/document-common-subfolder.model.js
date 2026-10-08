import { Model, DataTypes } from "sequelize";

export class DocumentCommonSubfolder extends Model {
  static associate(models) {
    DocumentCommonSubfolder.belongsTo(models.DocumentCommonFolder, { foreignKey: "document_common_folder_id", as: "parentFolder", onDelete: "CASCADE" });
    DocumentCommonSubfolder.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    DocumentCommonSubfolder.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  DocumentCommonSubfolder.init(
    {
      document_common_subfolder_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      document_common_folder_id: { type: DataTypes.UUID, allowNull: false },
      parent_subfolder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "document_common_subfolder", modelName: "DocumentCommonSubfolder", underscored: true },
  );
  return DocumentCommonSubfolder;
};
