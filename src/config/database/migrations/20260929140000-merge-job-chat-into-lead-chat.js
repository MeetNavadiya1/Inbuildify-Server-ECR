"use strict";

/**
 * One chat per build: a job's thread merges into the thread of the lead
 * (enquiry) it came from.
 *
 * Until now a lead and the job it turned into had a thread each, so a customer
 * saw "Enquiry LD…" and "Job LD…" as two conversations with their builder about
 * the same build. From here on the conversation is keyed by the lead whenever
 * the build has one (chat.service.js → conversationWhere), and this migration
 * folds the existing job threads into that one:
 *
 *   1. A job thread whose lead has no thread yet simply becomes the lead's
 *      thread (entity_type LEAD, job_id cleared) — nothing to move.
 *   2. Otherwise its messages move to the lead's thread, each reader keeps the
 *      later of their two read watermarks, and the emptied job thread is
 *      deleted.
 *
 * Jobs with no originating lead keep their own JOB thread, unchanged.
 *
 * Not reversible: once merged, which messages were sent on the job side is not
 * recorded, so `down` leaves the data as it is.
 */

export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  await sequelize.transaction(async (transaction) => {
    const run = (sql) => sequelize.query(sql, { transaction });

    // 1. Promote — at most one job thread per lead (the oldest), so the
    //    one-thread-per-lead unique index holds.
    await run(`
      UPDATE chat_conversation
         SET entity_type = 'LEAD', job_id = NULL, updated_at = NOW()
       WHERE chat_conversation_id IN (
         SELECT DISTINCT ON (j.leads_id) j.chat_conversation_id
           FROM chat_conversation j
          WHERE j.entity_type = 'JOB'
            AND j.leads_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM chat_conversation x
                             WHERE x.entity_type = 'LEAD' AND x.leads_id = j.leads_id)
          ORDER BY j.leads_id, j.created_at
       )`);

    // 2. Merge whatever job threads remain into their lead's thread.
    await run(`
      CREATE TEMP TABLE chat_merge_pairs ON COMMIT DROP AS
      SELECT j.chat_conversation_id AS from_id, l.chat_conversation_id AS to_id
        FROM chat_conversation j
        JOIN chat_conversation l ON l.entity_type = 'LEAD' AND l.leads_id = j.leads_id
       WHERE j.entity_type = 'JOB'`);

    await run(`
      UPDATE chat_message m
         SET chat_conversation_id = p.to_id
        FROM chat_merge_pairs p
       WHERE m.chat_conversation_id = p.from_id`);

    // Grouped first: a user may have read both threads, and ON CONFLICT cannot
    // touch the same row twice in one statement.
    await run(`
      INSERT INTO chat_participant
        (chat_conversation_id, user_id, participant_type, last_read_at, created_at, updated_at)
      SELECT p.to_id, cp.user_id, MAX(cp.participant_type), MAX(cp.last_read_at), NOW(), NOW()
        FROM chat_participant cp
        JOIN chat_merge_pairs p ON p.from_id = cp.chat_conversation_id
       GROUP BY p.to_id, cp.user_id
      ON CONFLICT (chat_conversation_id, user_id) DO UPDATE SET
        last_read_at = GREATEST(chat_participant.last_read_at, EXCLUDED.last_read_at),
        updated_at = NOW()`);

    await run(`
      UPDATE chat_conversation l
         SET last_message_at = (SELECT MAX(m.created_at) FROM chat_message m
                                 WHERE m.chat_conversation_id = l.chat_conversation_id),
             updated_at = NOW()
       WHERE l.chat_conversation_id IN (SELECT to_id FROM chat_merge_pairs)`);

    // Participants go with it (ON DELETE CASCADE); its messages already moved.
    await run(`
      DELETE FROM chat_conversation
       WHERE chat_conversation_id IN (SELECT from_id FROM chat_merge_pairs)`);
  });
}

export async function down() {
  // Irreversible by design — see the header.
}

export default { up, down };
