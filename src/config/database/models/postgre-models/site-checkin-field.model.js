import { Model, DataTypes } from "sequelize";

export class SiteCheckinField extends Model {
  static associate(models) {
    SiteCheckinField.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    SiteCheckinField.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    SiteCheckinField.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  SiteCheckinField.init(
    {
      site_checkin_field_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      // Field label shown on the QR form (e.g. "Safety Gloves", "Full Name")
      label: { type: DataTypes.STRING(255), allowNull: false },
      // text | checkbox | textarea | phone | email
      type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "text" },
      // personal | ppe | safety | other
      category: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "other" },
      is_mandatory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "site_checkin_field",
      modelName: "SiteCheckinField",
      underscored: true,
    },
  );
  return SiteCheckinField;
};
