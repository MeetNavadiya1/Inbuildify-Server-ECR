import { Model, DataTypes } from "sequelize";

export class SupplierContacts extends Model {
  static associate(models) {
    SupplierContacts.belongsTo(models.Supplier, { foreignKey: "supplier_id", as: "supplier", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  SupplierContacts.init(
    {
      supplier_contact_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      supplier_id: { type: DataTypes.UUID, allowNull: false },
      contact_name: { type: DataTypes.STRING(150), allowNull: false },
      email: { type: DataTypes.STRING(150), allowNull: true },
      phone: { type: DataTypes.STRING(50), allowNull: true },
      contact_type: { type: DataTypes.STRING(100), allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "supplier_contacts", modelName: "SupplierContacts", underscored: true },
  );
  return SupplierContacts;
};
