import { Model, DataTypes } from "sequelize";

export class FeaturedFacadeLead extends Model {
  static associate(models) {
    FeaturedFacadeLead.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead", onDelete: "CASCADE" });
    FeaturedFacadeLead.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    FeaturedFacadeLead.belongsTo(models.FeaturFacade, { foreignKey: "featur_facade_id", as: "featuredFacade", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  FeaturedFacadeLead.init(
    {
      featured_facade_lead_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true
      },
      leads_id: { type: DataTypes.UUID, allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: true },
      featur_facade_id: { type: DataTypes.UUID, allowNull: false },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP")
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP")
      },
    },
    {
      sequelize,
      tableName: "featured_facade_lead",
      modelName: "FeaturedFacadeLead",
      underscored: true
    }
  );
  return FeaturedFacadeLead;
};
