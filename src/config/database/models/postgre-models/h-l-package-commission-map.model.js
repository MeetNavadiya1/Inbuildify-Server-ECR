import { Model, DataTypes } from "sequelize";

export class HLPackageCommissionMap extends Model {
  static associate(models) {
    HLPackageCommissionMap.belongsTo(models.HouseLandPackage, { foreignKey: "house_land_package_id", as: "houseLandPackage", onDelete: "CASCADE" });
    HLPackageCommissionMap.belongsTo(models.JobCommission, { foreignKey: "job_commission_id", as: "jobCommission", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  HLPackageCommissionMap.init(
    {
      id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      house_land_package_id: { type: DataTypes.UUID, allowNull: true },
      total_commission: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      job_commission_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "h_l_package_commission_map", modelName: "HLPackageCommissionMap", underscored: true },
  );
  return HLPackageCommissionMap;
};
