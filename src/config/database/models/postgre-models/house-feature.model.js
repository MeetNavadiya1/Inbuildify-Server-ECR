import { Model, DataTypes } from "sequelize";

export class HouseFeature extends Model {
  static associate(models) {
    HouseFeature.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    HouseFeature.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    HouseFeature.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    HouseFeature.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  HouseFeature.init(
    {
      house_feature_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.STRING(3000), allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "house_feature", modelName: "HouseFeature", underscored: true },
  );
  return HouseFeature;
};
