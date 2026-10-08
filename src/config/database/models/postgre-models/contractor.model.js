import { Model, DataTypes } from "sequelize";

export class Contractor extends Model {
  static associate(models) {
    Contractor.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder" });
    Contractor.belongsTo(models.Service, { foreignKey: "service_id", as: "service" });
  }
}

export default (sequelize) => {
  Contractor.init(
    {
      contractor_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      email: { type: DataTypes.STRING(100), allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: false },
      phone: { type: DataTypes.STRING(15), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      service_id: { type: DataTypes.UUID, allowNull: false },
      is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "contractor", modelName: "Contractor", underscored: true },
  );
  return Contractor;
};
