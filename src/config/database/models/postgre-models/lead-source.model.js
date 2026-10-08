import { Model, DataTypes } from "sequelize";

export class LeadSource extends Model {
  static associate(models) {
    LeadSource.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    LeadSource.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    LeadSource.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    LeadSource.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    LeadSource.hasMany(models.Leads, { foreignKey: "lead_source_id", as: "leads" });
  }
}

export default (sequelize) => {
  LeadSource.init(
    {
      lead_source_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 1 },
      allow_change: { type: DataTypes.BOOLEAN, defaultValue: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
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
    { sequelize, tableName: "lead_source", modelName: "LeadSource", underscored: true,
      indexes: [{
        unique: true,
        // The owner is part of the key: the sample-data importer clones per
        // user, so two accounts under one company each hold their own seeded
        // "Walk-in". A row the builder typed in carries no owner, folds to the
        // one NULL bucket, and keeps exactly its old uniqueness. Kept in step
        // with 20260812130000-scope-sample-master-uniques-by-owner.
        fields: [
          "company_id",
          "builder_id",
          "name",
          sequelize.literal("(COALESCE(\"sample_data_owner_id\", '00000000-0000-0000-0000-000000000000'::uuid))"),
        ],
        name: "lead_source_company_builder_name_sample_owner",
      }] },
  );
  return LeadSource;
};
