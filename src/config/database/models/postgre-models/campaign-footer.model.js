import { Model, DataTypes } from "sequelize";

export class CampaignFooter extends Model {
  static associate(models) {
    CampaignFooter.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    CampaignFooter.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    CampaignFooter.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    CampaignFooter.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    CampaignFooter.hasMany(models.Campaign, { foreignKey: "footer_id", as: "campaigns" });
  }
}

export default (sequelize) => {
  CampaignFooter.init(
    {
      campaign_footer_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      builder_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      background_color: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      is_default: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "campaign_footer",
      modelName: "CampaignFooter",
      underscored: true,
    }
  );

  return CampaignFooter;
};
