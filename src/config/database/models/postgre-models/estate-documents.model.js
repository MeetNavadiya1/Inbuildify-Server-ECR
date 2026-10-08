import { Model, DataTypes } from "sequelize";

export class EstateDocuments extends Model {
  static associate(models) {
    EstateDocuments.belongsTo(models.Estate, { foreignKey: "estate_id", as: "estate", onDelete: "CASCADE" });
    EstateDocuments.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    EstateDocuments.belongsTo(models.Users, { foreignKey: "uploaded_by", as: "uploadedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  EstateDocuments.init({
    estate_document_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    estate_id: { type: DataTypes.UUID, allowNull: true },
    document_name: { type: DataTypes.STRING(255), allowNull: true },
    file_url: { type: DataTypes.STRING(500), allowNull: true },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    createdAt: { type: DataTypes.DATE },
    uploaded_at: { type: DataTypes.DATE },
    created_by: { type: DataTypes.UUID, allowNull: true },
    uploaded_by: { type: DataTypes.UUID, allowNull: true },
  }, { sequelize, tableName: "estate_documents", modelName: "EstateDocuments", underscored: true, updatedAt: false });
  return EstateDocuments;
};
