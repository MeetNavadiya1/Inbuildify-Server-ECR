import { Model, DataTypes } from "sequelize";

export class Supplier extends Model {
  static associate(models) {
    Supplier.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Supplier.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Supplier.belongsTo(models.State, { foreignKey: "state_id", as: "state", onDelete: "SET NULL" });
    Supplier.belongsTo(models.Country, { foreignKey: "country_id", as: "country", onDelete: "SET NULL" });
    Supplier.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Supplier.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Supplier.hasMany(models.SupplierContacts, { foreignKey: "supplier_id", as: "contacts" });
    Supplier.hasMany(models.SupplierDocuments, { foreignKey: "supplier_id", as: "documents" });
    Supplier.hasMany(models.SupplierSupplierTypeMap, { foreignKey: "supplier_id", as: "supplierTypeMaps" });
  }
}

export default (sequelize) => {
  Supplier.init(
    {
      supplier_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      supplier_type_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      company_name: { type: DataTypes.STRING(255), allowNull: false },
      abn: { type: DataTypes.STRING(50), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      contact_name: { type: DataTypes.STRING(150), allowNull: true },
      primary_phone: { type: DataTypes.STRING(50), allowNull: true },
      secondary_phone: { type: DataTypes.STRING(50), allowNull: true },
      website: { type: DataTypes.STRING(255), allowNull: true },
      address_line1: { type: DataTypes.STRING(255), allowNull: true },
      city: { type: DataTypes.STRING(150), allowNull: true },
      state_id: { type: DataTypes.UUID, allowNull: true },
      // Added by migration 20260928160000-add-country-to-supplier-and-surveyor.
      country_id: { type: DataTypes.UUID, allowNull: true },
      zip_code: { type: DataTypes.STRING(20), allowNull: true },
      lead_time: { type: DataTypes.STRING(100), allowNull: true },
      status: { type: DataTypes.BOOLEAN, defaultValue: true },
      email: { type: DataTypes.STRING(255), allowNull: false },
      work_cover_url: { type: DataTypes.STRING(500), allowNull: true },
      pl_insurance_url: { type: DataTypes.STRING(500), allowNull: true },
      white_card_url: { type: DataTypes.STRING(500), allowNull: true },
      fork_lift_license_url: { type: DataTypes.STRING(500), allowNull: true },
      trade_license_url: { type: DataTypes.STRING(500), allowNull: true },
      induction_pack_received: { type: DataTypes.BOOLEAN, defaultValue: false },
      induction_pack_url: { type: DataTypes.STRING(500), allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "supplier", modelName: "Supplier", underscored: true },
  );
  return Supplier;
};
