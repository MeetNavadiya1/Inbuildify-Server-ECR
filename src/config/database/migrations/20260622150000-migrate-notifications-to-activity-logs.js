import crypto from "crypto";

export const up = async (queryInterface, Sequelize) => {
  // 1. Fetch all notifications and their corresponding sender's company/builder
  const [notifications] = await queryInterface.sequelize.query(`
    SELECT n.*, u.company_id, u.builder_id
    FROM notifications n
    LEFT JOIN users u ON n.sender_id = u.users_id
  `);

  if (notifications.length === 0) return;

  // 2. Fetch all existing email activities from activity_logs to avoid duplicates
  const [existing] = await queryInterface.sequelize.query(`
    SELECT module_id FROM activity_logs WHERE module = 'Email' AND module_id IS NOT NULL
  `);
  const existingIds = new Set(existing.map((e) => e.module_id));

  const activityLogsToInsert = [];

  for (const n of notifications) {
    if (existingIds.has(n.notifications_id)) continue;

    // Safely parse metadata to extract the lead ID
    let metadata = {};
    if (n.metadata_json) {
      try {
        metadata = JSON.parse(n.metadata_json);
      } catch (e) {
        // ignore malformed JSON
      }
    }

    // Extract reference ID from metadata, fallback to the notification ID if missing
    const referenceId =
      metadata.leadsId ||
      metadata.leadId ||
      metadata.leads_id ||
      metadata.lead_id ||
      n.notifications_id;

    activityLogsToInsert.push({
      activity_log_id: crypto.randomUUID(),
      company_id: n.company_id || null,
      builder_id: n.builder_id || null,
      reference_id: referenceId,
      reference_type: "LEAD", // Email is broadly mapped to LEAD reference originally
      user_id: n.sender_id || null,
      module: "Email",
      module_id: n.notifications_id,
      record_name: n.title,
      description: n.body,
      created_at: n.created_at || new Date(),
      updated_at: n.updated_at || new Date(),
    });
  }

  // 3. Bulk insert them into activity_logs
  if (activityLogsToInsert.length > 0) {
    // Doing it in chunks to avoid blowing up memory with giant single SQL strings
    const chunkSize = 500;
    for (let i = 0; i < activityLogsToInsert.length; i += chunkSize) {
      const chunk = activityLogsToInsert.slice(i, i + chunkSize);
      await queryInterface.bulkInsert("activity_logs", chunk);
    }
  }
};

export const down = async (queryInterface, Sequelize) => {
  // Revert logic: delete only the ones mapped as Email
  await queryInterface.sequelize.query(`
    DELETE FROM activity_logs WHERE module = 'Email'
  `);
};
