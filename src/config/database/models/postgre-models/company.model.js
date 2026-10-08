import { Model, DataTypes } from "sequelize";

export class Company extends Model {
  static associate(models) {
    Company.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Company.belongsTo(models.Address, { foreignKey: "address_id", as: "address", onDelete: "SET NULL" });
    Company.belongsTo(models.Timezones, { foreignKey: "timezone_id", as: "timezone", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  Company.init(
    {
      company_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        field: "company_id",
      },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      abn_number: { type: DataTypes.STRING(20), allowNull: true },
      timezone_id: { type: DataTypes.UUID, allowNull: true },
      bank_name: { type: DataTypes.STRING(150), allowNull: true },
      account_name: { type: DataTypes.STRING(150), allowNull: true },
      account_number: { type: DataTypes.STRING(50), allowNull: true },
      account_bsb: { type: DataTypes.STRING(20), allowNull: true },
      email_signature_logo: { type: DataTypes.STRING(500), allowNull: true },
      company_logo: { type: DataTypes.STRING(500), allowNull: true },
      address_id: { type: DataTypes.UUID, allowNull: true },
      is_onboarding_finished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      website: { type: DataTypes.STRING(255), allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "company",
      modelName: "Company",
      underscored: true,
    },
  );
  return Company;
};
