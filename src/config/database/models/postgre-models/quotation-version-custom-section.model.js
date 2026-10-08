import { Model, DataTypes } from "sequelize";

export class QuotationVersionCustomSection extends Model {
  static associate(models) {
    QuotationVersionCustomSection.belongsTo(models.QuotationVersion, { foreignKey: "quotation_version_id", as: "quotationVersion", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  QuotationVersionCustomSection.init(
    {
      custom_section_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      quotation_version_id: { type: DataTypes.UUID, allowNull: true },
      file_url: { type: DataTypes.STRING(500), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "quotation_version_custom_section", modelName: "QuotationVersionCustomSection", underscored: true },
  );
  return QuotationVersionCustomSection;
};
