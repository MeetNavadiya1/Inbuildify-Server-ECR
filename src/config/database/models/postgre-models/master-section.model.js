import { Model, DataTypes } from "sequelize";

export class MasterSection extends Model {
  static associate(models) {
    MasterSection.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    MasterSection.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    MasterSection.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "CASCADE" });
    MasterSection.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "CASCADE" });
    MasterSection.hasMany(models.MasterSectionHeader, { foreignKey: "master_section_id", as: "headers" });
    MasterSection.belongsTo(models.QuotationFormat, {
      foreignKey: "quotation_format_id",
      as: "quotationFormat",
      onDelete: "CASCADE",
    });
  }
}

export default (sequelize) => {
  MasterSection.init(
    {
      master_section_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      quotation_format_id: { type: DataTypes.UUID, allowNull: true },
      master_name: { type: DataTypes.STRING(255), allowNull: false },
      status: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "master_section", modelName: "MasterSection", underscored: true },
  );
  return MasterSection;
};
