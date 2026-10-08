import { Model, DataTypes } from "sequelize";

export class UserGroup extends Model {
  static associate(models) {
    UserGroup.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    UserGroup.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    UserGroup.belongsTo(models.Users, { foreignKey: "created_by_id", as: "createdByUser", onDelete: "CASCADE" });
    UserGroup.belongsTo(models.Users, { foreignKey: "updated_by_id", as: "updatedByUser", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  UserGroup.init(
    {
      user_group_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      users_id: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by_id: { type: DataTypes.UUID, allowNull: false },
      updated_by_id: { type: DataTypes.UUID, allowNull: false },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "user_group", modelName: "UserGroup", underscored: true },
  );
  return UserGroup;
};
