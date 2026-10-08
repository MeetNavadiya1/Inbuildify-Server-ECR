import { Model, DataTypes } from "sequelize";

export class Country extends Model {
  static associate(models) {
    Country.hasMany(models.Address, { foreignKey: "country_id", as: "addresses" });
    Country.hasMany(models.State, { foreignKey: "country_id", as: "states" });
  }
}

export default (sequelize) => {
  Country.init(
    {
      country_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "country", modelName: "Country", underscored: true },
  );
  return Country;
};
