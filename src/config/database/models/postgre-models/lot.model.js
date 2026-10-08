import { Model, DataTypes } from "sequelize";

export class Lot extends Model {
  static associate(models) {
    Lot.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Lot.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Lot.belongsTo(models.Estate, { foreignKey: "estate_id", as: "estate", onDelete: "CASCADE" });
    Lot.belongsTo(models.EstateStages, { foreignKey: "estate_stage_id", as: "estateStage", onDelete: "CASCADE" });
    Lot.belongsTo(models.State, { foreignKey: "state_id", as: "state", onDelete: "SET NULL" });
    Lot.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Lot.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Lot.hasMany(models.LotPackage, { foreignKey: "lot_id", as: "lotPackages" });
  }
}

export default (sequelize) => {
  Lot.init(
    {
      lot_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      estate_id: { type: DataTypes.UUID, allowNull: true },
      estate_stage_id: { type: DataTypes.UUID, allowNull: true },
      lot_number: { type: DataTypes.STRING(255), allowNull: false },
      street: { type: DataTypes.STRING(255), allowNull: false },
      city: { type: DataTypes.STRING(255), allowNull: false },
      state_id: { type: DataTypes.UUID, allowNull: true },
      zip_code: { type: DataTypes.STRING(10), allowNull: false },
      title_status: { type: DataTypes.STRING(255), allowNull: true },
      title_date: { type: DataTypes.DATEONLY, allowNull: true },
      lot_type: { type: DataTypes.STRING(100), allowNull: true },
      corner_block: { type: DataTypes.BOOLEAN, allowNull: true },
      width_m: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      depth_m: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      size_m2: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      site_fall_mm: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      land_fill_mm: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      total_size_m2: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "lot", modelName: "Lot", underscored: true },
  );
  return Lot;
};
