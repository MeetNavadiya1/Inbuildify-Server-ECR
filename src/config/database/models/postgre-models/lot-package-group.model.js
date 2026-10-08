import { Model, DataTypes } from "sequelize";

export class LotPackageGroup extends Model {
  static associate(models) {
    LotPackageGroup.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    LotPackageGroup.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    LotPackageGroup.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    LotPackageGroup.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    LotPackageGroup.hasMany(models.LotPackage, { foreignKey: "lot_package_group_id", as: "lotPackages" });
  }
}

export default (sequelize) => {
  LotPackageGroup.init(
    {
      lot_package_group_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      group_name: { type: DataTypes.STRING(255), allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "lot_package_group", modelName: "LotPackageGroup", underscored: true },
  );
  return LotPackageGroup;
};
