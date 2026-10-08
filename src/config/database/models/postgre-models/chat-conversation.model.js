import { Model, DataTypes } from "sequelize";

/**
 * One chat thread per lead or per job. See the create-chat-tables migration for
 * why access is not stored here.
 */
export class ChatConversation extends Model {
  static associate(models) {
    ChatConversation.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead", onDelete: "CASCADE" });
    ChatConversation.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    ChatConversation.hasMany(models.ChatMessage, { foreignKey: "chat_conversation_id", as: "messages" });
    ChatConversation.hasMany(models.ChatParticipant, { foreignKey: "chat_conversation_id", as: "participants" });
  }
}

export default (sequelize) => {
  ChatConversation.init(
    {
      chat_conversation_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      entity_type: { type: DataTypes.STRING(10), allowNull: false },
      leads_id: { type: DataTypes.UUID, allowNull: true },
      job_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      last_message_at: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, field: "created_at" },
      updatedAt: { type: DataTypes.DATE, field: "updated_at" },
    },
    {
      sequelize,
      tableName: "chat_conversation",
      modelName: "ChatConversation",
      underscored: true,
      timestamps: true,
    },
  );
  return ChatConversation;
};
