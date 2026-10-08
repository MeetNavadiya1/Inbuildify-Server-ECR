import { Model, DataTypes } from "sequelize";

export class Package extends Model {
  static associate(models) {
    Package.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Package.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Package.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Package.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Package.hasMany(models.PackagePricelistItemMap, { foreignKey: "package_id", as: "pricelistItemMaps" });
  }
}

export default (sequelize) => {
  Package.init(
    {
      package_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      builder_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
      status: { type: DataTypes.BOOLEAN, defaultValue: true },
      range_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      package_group_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      dwelling_type_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      allow_add_item_from_pricelist: { type: DataTypes.BOOLEAN, defaultValue: false },
      allow_remove_package_items: { type: DataTypes.BOOLEAN, defaultValue: true },
      // Set only on rows the sample-data importer created, so Settings →
      // Sample Data can purge them without touching the builder's own catalog.
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "package", modelName: "Package", underscored: true },
  );
  return Package;
};
