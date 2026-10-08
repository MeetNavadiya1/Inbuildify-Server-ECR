import { Model, DataTypes } from "sequelize";

export class Property extends Model {
  static associate(models) {
    Property.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead" });
    Property.belongsTo(models.Address, { foreignKey: "address_id", as: "address" });
  }
}

export default (sequelize) => {
  Property.init(
    {
      property_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      leads_id: { type: DataTypes.UUID, allowNull: true },
      lot_no: { type: DataTypes.INTEGER, allowNull: true },
      street_no: { type: DataTypes.INTEGER, allowNull: true },
      address_id: { type: DataTypes.UUID, allowNull: true },
      estate_name: { type: DataTypes.STRING(255), allowNull: true },
      title_status: { type: DataTypes.STRING(255), allowNull: true },
      title_date: { type: DataTypes.DATEONLY, allowNull: true },
      compaction_report: { type: DataTypes.STRING(255), allowNull: true },
      land_type: { type: DataTypes.STRING(255), allowNull: true },
      width_m: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      depth_m: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      total_size_m2: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      site_fall_mm: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      land_fill_mm: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      bush_fire: { type: DataTypes.BOOLEAN, allowNull: true },
      corner_block: { type: DataTypes.BOOLEAN, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "property", modelName: "Property", underscored: true },
  );
  return Property;
};
