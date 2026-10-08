import { Model, DataTypes } from "sequelize";

export class Estate extends Model {
  static associate(models) {
    Estate.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Estate.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Estate.belongsTo(models.State, { foreignKey: "state_id", as: "state", onDelete: "SET NULL" });
    Estate.belongsTo(models.Country, { foreignKey: "country_id", as: "country", onDelete: "SET NULL" });
    Estate.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Estate.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Estate.hasMany(models.EstateDocuments, { foreignKey: "estate_id", as: "documents" });
    Estate.hasMany(models.EstateImages, { foreignKey: "estate_id", as: "images" });
    Estate.hasMany(models.EstateStages, { foreignKey: "estate_id", as: "stages" });
    Estate.hasMany(models.Lot, { foreignKey: "estate_id", as: "lots" });
  }
}

export default (sequelize) => {
  Estate.init(
    {
      estate_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      street_name: { type: DataTypes.STRING(150), allowNull: true },
      city: { type: DataTypes.STRING(100), allowNull: true },
      state_id: { type: DataTypes.UUID, allowNull: true },
      country_id: { type: DataTypes.UUID, allowNull: true },
      zip: { type: DataTypes.STRING(20), allowNull: true },
      estate_logo: { type: DataTypes.STRING(500), allowNull: true },
      website: { type: DataTypes.STRING(255), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.BOOLEAN, defaultValue: true },
      featured: { type: DataTypes.BOOLEAN, defaultValue: false },
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
    { sequelize, tableName: "estate", modelName: "Estate", underscored: true },
  );
  return Estate;
};
