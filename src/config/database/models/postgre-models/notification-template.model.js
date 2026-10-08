import { Model, DataTypes } from "sequelize";

export class NotificationTemplate extends Model {
  static associate(models) {
    NotificationTemplate.belongsTo(models.Company, {
      foreignKey: "company_id",
      as: "company",
    });

    NotificationTemplate.belongsTo(models.Builder, {
      foreignKey: "builder_id",
      as: "builder",
    });
  }
}

export default (sequelize) => {
  NotificationTemplate.init(
    {
      notification_template_id: {
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
      notification_type: {
        type: DataTypes.ENUM("EMAIL", "SMS"),
        allowNull: false,
        defaultValue: "EMAIL",
      },
      template_type: {
        type: DataTypes.ENUM(
          "PASSWORD_RESET",
          "INVITE_USER",
          "QUOTE_ACCEPTED",
          "NEW_MESSAGE",
          "PAYMENT_CONFIRMATION",
          "WELCOME_EMAIL",
          "APPOINTMENT_REMINDER",
          "CONSTRUCTION_UPDATE",
          "MAINTENANCE_REQUEST",
          "COLOR_SELECTION_REMINDER",
          "QUOTATION_SEND",
        ),
        allowNull: false,
      },
      title: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: DataTypes.DATE,
      },
      updated_at: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "notification_template",
      modelName: "NotificationTemplate",
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          unique: true,
          fields: ["company_id", "builder_id", "template_type"],
        },
      ],
      validate: {
        atLeastOneScope() {
          if (!this.company_id && !this.builder_id) {
            throw new Error(
              "Either company_id or builder_id must be provided.",
            );
          }
        },
      },
    },
  );

  return NotificationTemplate;
};
