import { Model, DataTypes } from "sequelize";

export class Campaign extends Model {
  static associate(models) {
    Campaign.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Campaign.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Campaign.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Campaign.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Campaign.belongsTo(models.Users, { foreignKey: "sent_by", as: "sentByUser", onDelete: "SET NULL" });
    Campaign.belongsTo(models.CampaignFooter, { foreignKey: "footer_id", as: "footer", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  Campaign.init(
    {
      campaign_id: {
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
        allowNull: true,
      },
      type: {
        type: DataTypes.ENUM("email", "sms"),
        allowNull: false,
        defaultValue: "email",
      },
      subject: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      attachment_url: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
      footer_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("draft", "sent"),
        allowNull: false,
        defaultValue: "draft",
      },
      contact_filter: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Stores the contact filter options selected in step 2",
      },
      selected_contact_ids: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Array of {id, type} for selected contacts",
      },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      sent_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
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
      tableName: "campaign",
      modelName: "Campaign",
      underscored: true,
    }
  );

  return Campaign;
};
