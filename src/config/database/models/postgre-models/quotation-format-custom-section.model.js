import { Model, DataTypes } from "sequelize";

export class QuotationFormatCustomSection extends Model {
  static associate(models) {
    QuotationFormatCustomSection.belongsTo(models.QuotationFormat, {
      foreignKey: "quotation_format_id",
      as: "quotationFormat",
      onDelete: "CASCADE",
    });
    QuotationFormatCustomSection.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    QuotationFormatCustomSection.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    QuotationFormatCustomSection.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "CASCADE" });
    QuotationFormatCustomSection.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  QuotationFormatCustomSection.init(
    {
      custom_section_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      quotation_format_id: { type: DataTypes.UUID, allowNull: true },
      field_name: { type: DataTypes.STRING(255), allowNull: false },
      field_label: { type: DataTypes.STRING(255), allowNull: false },
      is_applicable: { type: DataTypes.BOOLEAN, defaultValue: false },
      group_field: { type: DataTypes.BOOLEAN, defaultValue: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: true },
      parent_field: {
        type: DataTypes.ENUM,
        values: [
          "Facade Name",
          "Property Address",
          "Client Email",
          "Client Mobile",
        ],
        allowNull: true,
        validate: {
          isIn: [[
            "Facade Name",
            "Property Address",
            "Client Email",
            "Client Mobile"]],
        },
      },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "quotation_format_custom_section",
      modelName: "QuotationFormatCustomSection",
      underscored: true,
    }
  );
  return QuotationFormatCustomSection;
};
