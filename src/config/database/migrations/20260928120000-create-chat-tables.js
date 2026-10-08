"use strict";

/**
 * Lead / Job chat.
 *
 * One conversation per record: a lead has its own thread, and the job it turns
 * into gets a separate one — "Chat must be specific to the selected Lead/Job".
 * Everyone allowed to open the record talks in the same thread (the customer's
 * contacts on one side, the builder's people on the other), so there is no
 * per-pair thread to pick between and no message a colleague cannot see.
 *
 *   chat_conversation  one row per lead or job, created on the first message.
 *   chat_message       the history. sender_role is snapshotted so a message
 *                      keeps saying "Contact" / "Builder" after a role change.
 *   chat_participant   per-user read watermark. Read/unread is `last_read_at`:
 *                      every message newer than it, sent by someone else, is
 *                      unread for that user. One row per user per thread
 *                      instead of one row per user per message.
 *
 * Who may reach a conversation is NOT stored here — it is resolved from the
 * lead/job on every request (chat.service.js), so revoking someone's access to
 * the record revokes the chat with it.
 */

const uuidPk = (Sequelize) => ({
  type: Sequelize.UUID,
  defaultValue: Sequelize.literal("gen_random_uuid()"),
  primaryKey: true,
  allowNull: false,
});

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
});

async function ensureConstraintsAndIndexes(queryInterface) {
  const statements = [
    // A LEAD thread has no job; a JOB thread always has one. leads_id is also
    // stamped on a JOB thread (the job's originating lead) for listing.
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_conversation_entity_ck') THEN
         ALTER TABLE chat_conversation ADD CONSTRAINT chat_conversation_entity_ck CHECK (
           (entity_type = 'LEAD' AND leads_id IS NOT NULL AND job_id IS NULL)
           OR (entity_type = 'JOB' AND job_id IS NOT NULL)
         );
       END IF;
     END $$;`,
    // Exactly one thread per record. Partial so the job thread's copy of
    // leads_id does not collide with the lead's own thread.
    `CREATE UNIQUE INDEX IF NOT EXISTS chat_conversation_lead_uq
       ON chat_conversation (leads_id) WHERE entity_type = 'LEAD'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS chat_conversation_job_uq
       ON chat_conversation (job_id) WHERE entity_type = 'JOB'`,
    `CREATE INDEX IF NOT EXISTS chat_conversation_company_last_idx
       ON chat_conversation (company_id, last_message_at DESC)`,
    `CREATE INDEX IF NOT EXISTS chat_conversation_builder_last_idx
       ON chat_conversation (builder_id, last_message_at DESC)`,
    `CREATE INDEX IF NOT EXISTS chat_message_conversation_created_idx
       ON chat_message (chat_conversation_id, created_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS chat_participant_conversation_user_uq
       ON chat_participant (chat_conversation_id, user_id)`,
    `CREATE INDEX IF NOT EXISTS chat_participant_user_idx
       ON chat_participant (user_id)`,
  ];

  for (const sql of statements) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();

  if (!existing.includes("chat_conversation")) {
    await queryInterface.createTable("chat_conversation", {
      chat_conversation_id: uuidPk(Sequelize),
      entity_type: { type: Sequelize.STRING(10), allowNull: false },
      leads_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "leads", key: "leads_id" },
        onDelete: "CASCADE",
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "job", key: "job_id" },
        onDelete: "CASCADE",
      },
      // Copied from the lead/job when the thread is created — lets the inbox
      // narrow by tenant before joining back to the record.
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "company", key: "company_id" },
        onDelete: "SET NULL",
      },
      builder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "builder", key: "builder_id" },
        onDelete: "SET NULL",
      },
      last_message_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps(Sequelize),
    });
  }

  if (!existing.includes("chat_message")) {
    await queryInterface.createTable("chat_message", {
      chat_message_id: uuidPk(Sequelize),
      chat_conversation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "chat_conversation", key: "chat_conversation_id" },
        onDelete: "CASCADE",
      },
      // SET NULL rather than CASCADE: removing a user must not rewrite the
      // other side's history.
      sender_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "users_id" },
        onDelete: "SET NULL",
      },
      sender_role: { type: Sequelize.STRING(100), allowNull: true },
      // CONTACT (the customer side) or STAFF (the builder side).
      sender_type: { type: Sequelize.STRING(10), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      ...timestamps(Sequelize),
    });
  }

  if (!existing.includes("chat_participant")) {
    await queryInterface.createTable("chat_participant", {
      chat_participant_id: uuidPk(Sequelize),
      chat_conversation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "chat_conversation", key: "chat_conversation_id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "users_id" },
        onDelete: "CASCADE",
      },
      participant_type: { type: Sequelize.STRING(10), allowNull: false },
      last_read_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps(Sequelize),
    });
  }

  await ensureConstraintsAndIndexes(queryInterface);
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  for (const table of ["chat_participant", "chat_message", "chat_conversation"]) {
    if (existing.includes(table)) {
      await queryInterface.dropTable(table);
    }
  }
}

export default { up, down };
