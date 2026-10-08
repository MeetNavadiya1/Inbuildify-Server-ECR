import { Model, DataTypes } from "sequelize";

export class ConstructionOhsSettings extends Model {
  static associate(models) {
    ConstructionOhsSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ConstructionOhsSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    ConstructionOhsSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ConstructionOhsSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    ConstructionOhsSettings.hasMany(models.ConstructionOhsList, { foreignKey: "construction_ohs_settings_id", as: "ohsLists" });
  }
}

export default (sequelize) => {
  ConstructionOhsSettings.init(
    {
      construction_ohs_settings_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      signature_required: { type: DataTypes.BOOLEAN, defaultValue: false },
      minimum_audits: { type: DataTypes.INTEGER, defaultValue: 0 },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "construction_ohs_settings",
      modelName: "ConstructionOhsSettings",
      underscored: true,
    },
  );
  return ConstructionOhsSettings;
};
