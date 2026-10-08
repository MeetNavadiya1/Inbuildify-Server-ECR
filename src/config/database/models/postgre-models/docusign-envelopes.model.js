import { Model, DataTypes } from "sequelize";

export default (sequelize) => {
  class DocuSignEnvelope extends Model {
    static associate(models) {
      DocuSignEnvelope.belongsTo(models.Leads, {
        foreignKey: "leads_id",
        as: "lead",
      });
      DocuSignEnvelope.belongsTo(models.Users, {
        foreignKey: "created_by",
        as: "creator",
      });
      DocuSignEnvelope.belongsTo(models.QuotationVersion, {
        foreignKey: "reference_id",
        as: "quotationVersion",
        constraints: false,
      });
    }
  }

  DocuSignEnvelope.init(
    {
      envelope_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      reference_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM("quotation", "agreement", "variation"),
        allowNull: false,
      },
      signer_email: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      signer_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("created", "sent", "delivered", "signed", "completed", "declined", "voided"),
        allowNull: false,
        defaultValue: "created",
      },
      signed_document_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      leads_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "DocuSignEnvelope",
      tableName: "docusign_envelopes",
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return DocuSignEnvelope;
};
