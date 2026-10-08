import { Model, DataTypes } from "sequelize";

export class Service extends Model {
  static associate(models) {
    Service.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder" });
  }
}

export default (sequelize) => {
  Service.init(
    {
      service_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      service: { type: DataTypes.STRING(100), allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "service",
      modelName: "Service",
      underscored: true,
      indexes: [
        {
          unique: true,
          // The owner is part of the key: the sample-data importer clones per
          // user, so two accounts under one builder each hold their own seeded
          // "Bricklaying". A row the builder typed in carries no owner, folds to
          // the one NULL bucket, and keeps exactly its old uniqueness. Kept in
          // step with 20260812130000-scope-sample-master-uniques-by-owner.
          fields: [
            "service",
            "builder_id",
            sequelize.literal("(COALESCE(\"sample_data_owner_id\", '00000000-0000-0000-0000-000000000000'::uuid))"),
          ],
          name: "uq_service_builder_sample_owner",
        },
      ],
    },
  );
  return Service;
};
