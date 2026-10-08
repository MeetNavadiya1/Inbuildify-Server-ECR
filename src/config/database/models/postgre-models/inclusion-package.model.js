import { Model, DataTypes } from "sequelize";

export class InclusionPackage extends Model {
  static associate(models) {
    InclusionPackage.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    InclusionPackage.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    InclusionPackage.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    InclusionPackage.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  InclusionPackage.init(
    {
      inclusion_package_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "inclusion_package", modelName: "InclusionPackage", underscored: true },
  );
  return InclusionPackage;
};
