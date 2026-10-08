import { Model, DataTypes } from "sequelize";

export class Timezones extends Model {
  static associate(models) {
    // No FK relationships — referenced by company.timezone_id
  }
}

export default (sequelize) => {
  Timezones.init(
    {
      timezone_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      country_code: { type: DataTypes.STRING(2), allowNull: false },
      timezone_name: { type: DataTypes.STRING(100), allowNull: false },
      display_name: { type: DataTypes.STRING(150), allowNull: false },
      utc_offset_minutes: { type: DataTypes.INTEGER, allowNull: false },
      is_dst: { type: DataTypes.BOOLEAN, defaultValue: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "timezones", modelName: "Timezones", underscored: true },
  );
  return Timezones;
};
