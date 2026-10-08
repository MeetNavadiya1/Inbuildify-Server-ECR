import { Model, DataTypes } from "sequelize";

export class ChatMessage extends Model {
  static associate(models) {
    ChatMessage.belongsTo(models.ChatConversation, {
      foreignKey: "chat_conversation_id",
      as: "conversation",
      onDelete: "CASCADE",
    });
    ChatMessage.belongsTo(models.Users, { foreignKey: "sender_id", as: "sender", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  ChatMessage.init(
    {
      chat_message_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      chat_conversation_id: { type: DataTypes.UUID, allowNull: false },
      sender_id: { type: DataTypes.UUID, allowNull: true },
      // Role name at the time of sending, e.g. "Builder", "Contact".
      sender_role: { type: DataTypes.STRING(100), allowNull: true },
      // CONTACT (customer side) or STAFF (builder side).
      sender_type: { type: DataTypes.STRING(10), allowNull: false },
      // Empty when the message is attachments only.
      body: { type: DataTypes.TEXT, allowNull: false },
      // [{ key, name, mime_type, size }] — S3 keys; URLs are presigned on read.
      attachments: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      createdAt: { type: DataTypes.DATE, field: "created_at" },
      updatedAt: { type: DataTypes.DATE, field: "updated_at" },
    },
    {
      sequelize,
      tableName: "chat_message",
      modelName: "ChatMessage",
      underscored: true,
      timestamps: true,
    },
  );
  return ChatMessage;
};
