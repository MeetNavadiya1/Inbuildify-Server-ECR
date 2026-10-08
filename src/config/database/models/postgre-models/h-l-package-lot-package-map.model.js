import { Model, DataTypes } from "sequelize";

export class HLPackageLotPackageMap extends Model {
  static associate(models) {
    HLPackageLotPackageMap.belongsTo(models.HouseLandPackage, { foreignKey: "house_land_package_id", as: "houseLandPackage", onDelete: "CASCADE" });
    HLPackageLotPackageMap.belongsTo(models.LotPackage, { foreignKey: "lot_package_id", as: "lotPackage", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  HLPackageLotPackageMap.init(
    {
      id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      house_land_package_id: { type: DataTypes.UUID, allowNull: true },
      lot_package_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "h_l_package_lot_package_map", modelName: "HLPackageLotPackageMap", underscored: true },
  );
  return HLPackageLotPackageMap;
};
