import { Model, DataTypes } from "sequelize";

export class State extends Model {
  static associate(models) {
    State.belongsTo(models.Country, { foreignKey: "country_id", as: "country", onDelete: "CASCADE" });
    State.hasMany(models.Address, { foreignKey: "state_id", as: "addresses" });
  }
}

export default (sequelize) => {
  State.init(
    {
      state_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      country_id: { type: DataTypes.UUID, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "state", modelName: "State", underscored: true,
      indexes: [{ unique: true, fields: ["country_id", "name"] }] },
  );
  return State;
};
