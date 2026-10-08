import { Model, DataTypes } from "sequelize";

export class QuotationVersionPackageMap extends Model {
  static associate(models) {
    QuotationVersionPackageMap.belongsTo(models.QuotationVersion, { foreignKey: "quotation_version_id", as: "quotationVersion", onDelete: "CASCADE" });
    QuotationVersionPackageMap.belongsTo(models.Package, { foreignKey: "package_id", as: "package", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  QuotationVersionPackageMap.init({
    id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    quotation_version_id: { type: DataTypes.UUID, allowNull: true },
    package_id: { type: DataTypes.UUID, allowNull: true },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    createdAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "quotation_version_package_map", modelName: "QuotationVersionPackageMap", underscored: true, updatedAt: false });
  return QuotationVersionPackageMap;
};
