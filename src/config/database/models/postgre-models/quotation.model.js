import { Model, DataTypes } from "sequelize";

export class Quotation extends Model {
  static associate(models) {
    Quotation.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead", onDelete: "CASCADE" });
    Quotation.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Quotation.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Quotation.hasMany(models.QuotationVersion, { foreignKey: "quotation_id", as: "versions" });
  }
}

export default (sequelize) => {
  Quotation.init(
    {
      quotation_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      leads_id: { type: DataTypes.UUID, allowNull: true },
      reference_number: { type: DataTypes.STRING(30), allowNull: true },
      is_hl_package_quotation: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "quotation", modelName: "Quotation", underscored: true },
  );
  return Quotation;
};
