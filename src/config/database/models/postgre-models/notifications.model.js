import { Model, DataTypes } from "sequelize";

export class Notifications extends Model {
  static associate(models) {
    Notifications.belongsTo(models.Users, {
      foreignKey: "sender_id",
      as: "sender",
    });

    Notifications.belongsTo(models.NotificationTemplate, {
      foreignKey: "template_id",
      as: "template",
    });
  }
}

export default (sequelize) => {
  Notifications.init(
    {
      notifications_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      sender_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      receiver_info: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      template_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      notification_type: {
        type: DataTypes.ENUM("EMAIL", "SMS"),
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      body: {
        type: DataTypes.STRING(1000),
        allowNull: false,
      },
      metadata_json: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      delivery_status: {
        type: DataTypes.ENUM("PENDING", "SENT", "FAILED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      failure_reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
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
      tableName: "notifications",
      modelName: "Notifications",
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  return Notifications;
};
