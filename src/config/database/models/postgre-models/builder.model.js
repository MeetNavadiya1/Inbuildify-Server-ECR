import { Model, DataTypes } from "sequelize";

export class Builder extends Model {
  static associate(models) {
    Builder.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Builder.belongsTo(models.Address, { foreignKey: "address_id", as: "address", onDelete: "SET NULL" });
    Builder.hasMany(models.Users, { foreignKey: "builder_id", as: "users" });
    Builder.hasMany(models.BuilderInsurer, { foreignKey: "builder_id", as: "insurers" });
    Builder.hasMany(models.Categories, { foreignKey: "builder_id", as: "categories" });
  }
}

export default (sequelize) => {
  Builder.init(
    {
      builder_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      firm_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      slogan: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      logo: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      abn_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      phone_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      acn_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      hia_membership_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      registration_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      practitioner_reg_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      license_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      licensed_builder_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      address_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      bank_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      account_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      account_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      account_bsb: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      registered_building_practitioner: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "builder",
      modelName: "Builder",
      underscored: true,
    },
  );

  return Builder;
};
