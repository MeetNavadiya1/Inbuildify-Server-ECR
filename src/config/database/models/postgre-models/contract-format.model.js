import { Model, DataTypes } from "sequelize";

export class ContractFormat extends Model {
  static associate(models) {
    ContractFormat.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ContractFormat.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builderRef", onDelete: "CASCADE" }); // ← changed
    ContractFormat.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ContractFormat.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    ContractFormat.hasMany(models.ContractSection, { foreignKey: "contract_format_id", as: "contractSections" });
  }
}

export default (sequelize) => {
  ContractFormat.init(
    {
      contract_format_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      builder: { type: DataTypes.UUID, allowNull: true },
      format_name: { type: DataTypes.STRING(255), allowNull: false },
      default_format: { type: DataTypes.BOOLEAN, defaultValue: true },
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
    {
      sequelize,
      tableName: "contract_format",
      modelName: "ContractFormat",
      underscored: true,
    },
  );
  return ContractFormat;
};
