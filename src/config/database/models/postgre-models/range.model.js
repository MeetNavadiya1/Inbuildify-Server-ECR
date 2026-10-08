import { Model, DataTypes } from "sequelize";

export class Range extends Model {
  static associate(models) {
    Range.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Range.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Range.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Range.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  Range.init(
    {
      range_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      logo_url: { type: DataTypes.STRING(500), allowNull: true },
      header_url: { type: DataTypes.STRING(500), allowNull: true },
      user_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 1 },
      bg_color: { type: DataTypes.STRING(50), allowNull: true },
      font_color: { type: DataTypes.STRING(50), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
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
    { sequelize, tableName: "range", modelName: "Range", underscored: true },
  );
  return Range;
};
