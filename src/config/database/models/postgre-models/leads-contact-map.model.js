import { Model, DataTypes } from "sequelize";

export class LeadsContactMap extends Model {
  static associate(models) {
    LeadsContactMap.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead", onDelete: "CASCADE" });
    LeadsContactMap.belongsTo(models.Users, { foreignKey: "contact_id", as: "contact", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  LeadsContactMap.init(
    {
      id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      leads_id: { type: DataTypes.UUID, allowNull: true },
      contact_id: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "leads_contact_map", modelName: "LeadsContactMap", underscored: true },
  );
  return LeadsContactMap;
};
