"use strict";

/**
 * Chat attachments — images and files sent in a lead / job thread.
 *
 * Stored on the message itself as a JSONB array rather than a separate table:
 * an attachment is only ever read with its message, never queried on its own,
 * and is never edited after sending.
 *
 *   [{ key, name, mime_type, size }]
 *
 * `key` is the S3 object key. URLs are never stored — they are presigned on
 * every read, so access keeps following the thread's access rules.
 *
 * A message may now be attachments only, so `body` can be an empty string
 * (it stays NOT NULL; the service requires text or at least one file).
 */

export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable("chat_message");
  if (!columns.attachments) {
    await queryInterface.addColumn("chat_message", "attachments", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });
  }
}

export async function down(queryInterface) {
  const columns = await queryInterface.describeTable("chat_message");
  if (columns.attachments) {
    await queryInterface.removeColumn("chat_message", "attachments");
  }
}

export default { up, down };
