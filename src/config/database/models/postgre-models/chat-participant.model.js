import { Model, DataTypes } from "sequelize";

/**
 * A user's read watermark on one conversation. Created the first time the user
 * reads or sends; a user with no row has read nothing.
 */
export class ChatParticipant extends Model {
  static associate(models) {
    ChatParticipant.belongsTo(models.ChatConversation, {
      foreignKey: "chat_conversation_id",
      as: "conversation",
      onDelete: "CASCADE",
    });
    ChatParticipant.belongsTo(models.Users, { foreignKey: "user_id", as: "user", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  ChatParticipant.init(
    {
      chat_participant_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      chat_conversation_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      participant_type: { type: DataTypes.STRING(10), allowNull: false },
      last_read_at: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, field: "created_at" },
      updatedAt: { type: DataTypes.DATE, field: "updated_at" },
    },
    {
      sequelize,
      tableName: "chat_participant",
      modelName: "ChatParticipant",
      underscored: true,
      timestamps: true,
    },
  );
  return ChatParticipant;
};
