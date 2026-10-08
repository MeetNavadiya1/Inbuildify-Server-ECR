import { Model, DataTypes } from "sequelize";

export class Holiday extends Model {
  static associate(models) {
    Holiday.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Holiday.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Holiday.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Holiday.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  Holiday.init(
    {
      holiday_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      state: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      holiday_start_date: { type: DataTypes.DATEONLY, allowNull: false },
      holiday_end_date: { type: DataTypes.DATEONLY, allowNull: false },
      holiday_description: { type: DataTypes.STRING(500), allowNull: false },
      status: { type: DataTypes.BOOLEAN, defaultValue: true },
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
    { sequelize, tableName: "holiday", modelName: "Holiday", underscored: true },
  );
  return Holiday;
};
