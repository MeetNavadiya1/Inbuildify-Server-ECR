import { Model, DataTypes } from "sequelize";

export class AgentReferralPartner extends Model {
  static associate(models) {
    AgentReferralPartner.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    AgentReferralPartner.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    AgentReferralPartner.belongsTo(models.Users, { foreignKey: "user_id", as: "user", onDelete: "SET NULL" });
    AgentReferralPartner.belongsTo(models.Address, { foreignKey: "address_id", as: "address", onDelete: "SET NULL" });
    AgentReferralPartner.belongsTo(models.Users, { foreignKey: "referred_user_id", as: "referredUser", onDelete: "SET NULL" });
    AgentReferralPartner.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    AgentReferralPartner.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  AgentReferralPartner.init(
    {
      agent_referral_partner_id: {
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
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      address_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      account_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      account_bsb: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      account_number: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      abn: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      company_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      referred_user_id: {
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
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "agent_referral_partner",
      modelName: "AgentReferralPartner",
      underscored: true,
    },
  );

  return AgentReferralPartner;
};
