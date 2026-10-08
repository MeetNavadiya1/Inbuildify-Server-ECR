import { Model, DataTypes } from "sequelize";

export class BusinessContact extends Model {
  static associate(models) {
    BusinessContact.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead", onDelete: "CASCADE" });
    BusinessContact.belongsTo(models.Country, { foreignKey: "country_id", as: "country", onDelete: "SET NULL" });
    BusinessContact.belongsTo(models.State, { foreignKey: "state_id", as: "state", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  BusinessContact.init({
    business_contact_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    leads_id: { type: DataTypes.UUID, allowNull: true },
    contact_type: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    address1: { type: DataTypes.STRING(255), allowNull: true },
    address2: { type: DataTypes.STRING(255), allowNull: true },
    city: { type: DataTypes.STRING(255), allowNull: true },
    zip_code: { type: DataTypes.STRING(10), allowNull: true },
    country_id: { type: DataTypes.UUID, allowNull: true },
    state_id: { type: DataTypes.UUID, allowNull: true },
    abn_number: { type: DataTypes.STRING(20), allowNull: true },
    acn_number: { type: DataTypes.STRING(20), allowNull: true },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "business_contact", modelName: "BusinessContact", underscored: true });
  return BusinessContact;
};
