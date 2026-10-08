import { Model, DataTypes } from "sequelize";

export class SupplierSupplierTypeMap extends Model {
  static associate(models) {
    SupplierSupplierTypeMap.belongsTo(models.Supplier, { foreignKey: "supplier_id", as: "supplier", onDelete: "CASCADE" });
    SupplierSupplierTypeMap.belongsTo(models.SupplierType, { foreignKey: "supplier_type_id", as: "supplierType", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  SupplierSupplierTypeMap.init(
    {
      id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      supplier_id: { type: DataTypes.UUID, allowNull: false },
      supplier_type_id: { type: DataTypes.UUID, allowNull: false },
      is_recommended: { type: DataTypes.BOOLEAN, defaultValue: false },
      assign_to_new_and_existing_checklist: { type: DataTypes.BOOLEAN, defaultValue: false },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "supplier_supplier_type_map", modelName: "SupplierSupplierTypeMap", underscored: true },
  );
  return SupplierSupplierTypeMap;
};
