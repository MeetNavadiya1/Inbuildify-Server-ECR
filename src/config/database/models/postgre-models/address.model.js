import { Model, DataTypes } from "sequelize";

export class Address extends Model {
  static associate(models) {
    Address.belongsTo(models.Country, { foreignKey: "country_id", as: "country", onDelete: "SET NULL" });
    Address.belongsTo(models.State, { foreignKey: "state_id", as: "state", onDelete: "SET NULL" });
    Address.hasMany(models.Users, { foreignKey: "address_id", as: "users" });
    Address.hasOne(models.Builder, { foreignKey: "address_id", as: "builder" });
    Address.hasOne(models.Company, { foreignKey: "address_id", as: "company" });
  }
}

export default (sequelize) => {
  Address.init(
    {
      address_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      country_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      state_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      address_line1: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      address_line2: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      zip_code: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "address",
      modelName: "Address",
      underscored: true,
    },
  );

  return Address;
};
