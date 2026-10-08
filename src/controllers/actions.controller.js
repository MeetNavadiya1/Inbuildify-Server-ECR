const getPool = require("../config/database");
const { successResponse, errorResponse } = require("../helper/response");
const { keysToCamelCase } = require("../utils/common");
const { deleteFromS3 } = require("../utils/s3Upload");

const getUsersDetails = async (client, userIds) => {
  if (!userIds || userIds.length === 0) return {};
  
  const validUserIds = userIds.filter(Boolean);
  if (validUserIds.length === 0) return {};

  const usersQuery = `
    SELECT users_id, name 
    FROM users 
    WHERE users_id = ANY($1::uuid[])
  `;
  const usersResult = await client.query(usersQuery, [validUserIds]);
  
  return usersResult.rows.reduce((acc, row) => {
    acc[row.users_id] = row.name;
    return acc;
  }, {});
};

const formatUserObject = (userId, usersMap) => {
  if (!userId) return null;
  return {
    id: userId,
    name: usersMap[userId] || null
  };
};

exports.createAction = async (req, res) => {
  const { lead_id } = req.params;
  const builderId = req.user.builder_id;
  const attachment = req.file?.location;
  const {
    type,
    message,
    tags,
    sendToCustomer,
    createFollowUpTask,
    task,
    recipient,
    title,
    date,
    start_time,
    end_time,
    location,
    select_users,
    notes,
  } = req.body;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const checkLeadExists = await client.query(
      `SELECT * FROM leads WHERE lead_id = $1 AND builder_id = $2 AND is_deleted = false`,
      [lead_id, builderId]
    );

    if (checkLeadExists.rowCount === 0) {
      return errorResponse(res, 404, "Lead not found.");
    }

    const insertAction = `
      INSERT INTO actions (type, builder_id, lead_id, created_by_id, updated_by_id)
      VALUES ($1, $2, $3, $4, $4)
      RETURNING *
    `;
    const result = await client.query(insertAction, [
      type,
      builderId,
      lead_id,
      req.user.user_id,
    ]);
    const action = result.rows[0];

    let tagIds = [];
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        const tagRes = await client.query(
          `INSERT INTO tags (builder_id, name)
           VALUES ($1, $2)
           ON CONFLICT (builder_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING tag_id`,
          [builderId, tagName]
        );
        tagIds.push(tagRes.rows[0].tag_id);
      }
    }

    let details = null;
    if (type === "NOTES") {
      let taskId = null;

      if (createFollowUpTask && task) {
        const taskRes = await client.query(
          `INSERT INTO task (action_id, name, due_date, priority, description)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [
            action.action_id,
            task.name,
            task.due_date,
            task.priority,
            task.description || null,
          ]
        );
        taskId = taskRes.rows[0].task_id;
      }

      const notesRes = await client.query(
        `INSERT INTO notes (action_id, message, tags, attachment, task_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [action.action_id, message, tagIds, attachment || null, taskId]
      );
      details = notesRes.rows[0];
    }

    if (type === "SMS") {
      const recipients = Array.isArray(recipient) ? recipient : [recipient];

      const contactCheckQuery = `
        SELECT leads_contact_id, name
        FROM leads_contact
        WHERE leads_contact_id = ANY($1::uuid[])
          AND lead_id = $2
      `;
      const contactCheckRes = await client.query(contactCheckQuery, [
        recipients,
        lead_id,
      ]);

      const foundIds = contactCheckRes.rows.map((r) => r.leads_contact_id);
      const missing = recipients.filter((id) => !foundIds.includes(id));

      if (missing.length > 0) {
        await client.query("ROLLBACK");
        return errorResponse(
          res,
          404,
          `Recipients not found: ${missing.join(", ")}`
        );
      }

      const smsRes = await client.query(
        `INSERT INTO sms (action_id, recipient, message)
         VALUES ($1, $2::uuid[], $3) RETURNING *`,
        [action.action_id, recipients, message]
      );

      details = {
        smsId: smsRes.rows[0].sms_id,
        actionId: smsRes.rows[0].action_id,
        recipient: recipients.map((id) => {
          const contact = contactCheckRes.rows.find(
            (c) => c.leads_contact_id === id
          );
          return {
            id,
            name: contact ? contact.name : null,
          };
        }),
        message: smsRes.rows[0].message,
        isDeleted: smsRes.rows[0].is_deleted,
        createdAt: smsRes.rows[0].created_at,
        updatedAt: smsRes.rows[0].updated_at,
      };
    }

    if (type === "APPOINTMENT") {
      let selectedUserMap = {};

      if (select_users && select_users.length > 0) {
        const selectUsersRes = await client.query(
          `SELECT users_id, name FROM users WHERE users_id = ANY($1::uuid[]) AND builder_id = $2 AND is_verified = true AND is_deleted = false`,
          [select_users, builderId]
        );
        if (selectUsersRes.rowCount === 0) {
          await client.query("ROLLBACK");
          return errorResponse(
            res,
            404,
            "Select users not found or not verified."
          );
        }
        selectedUserMap = Object.fromEntries(
          selectUsersRes.rows.map((u) => [u.users_id, u.name])
        );
      }
      const appointmentRes = await client.query(
        `INSERT INTO appointment (action_id, title, date, start_time, end_time, location, select_users, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          action.action_id,
          title,
          date,
          start_time,
          end_time,
          location,
          select_users,
          notes,
        ]
      );
      details = appointmentRes.rows[0];

      details.selectUsers = (details.select_users || []).map((id) => ({
        id,
        name: selectedUserMap[id] || null,
      }));
    }

    if (type === "TASK") {
      if (task.assignee) {
        const assigneeRes = await client.query(
          `SELECT users_id FROM users WHERE users_id = $1 AND builder_id = $2 AND is_verified = true AND is_deleted = false`,
          [task.assignee, builderId]
        );
        if (assigneeRes.rowCount === 0) {
          await client.query("ROLLBACK");
          return errorResponse(res, 404, "Assignee not found or not verified.");
        }
      }

      const taskRes = await client.query(
        `INSERT INTO task (action_id, name, due_date, priority, description, time, assignee, attachment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          action.action_id,
          task.name,
          task.due_date,
          task.priority,
          task.description || null,
          task.time || null,
          task.assignee || null,
          attachment || null,
        ]
      );
      details = taskRes.rows[0];

      if (details.assignee) {
        const assigneeMap = await getUsersDetails(client, [details.assignee]);
        details.assignee = formatUserObject(details.assignee, assigneeMap);
      } else {
        details.assignee = null;
      }
    }

    // Get user details for created_by and updated_by
    const usersMap = await getUsersDetails(client, [
      action.created_by_id,
      action.updated_by_id,
    ]);

    const tagNamesRes = await client.query(
      `SELECT t.tag_id, t.name FROM tags t WHERE t.tag_id = ANY($1::uuid[]) AND t.builder_id = $2 AND t.is_deleted = false`,
      [tagIds, builderId]
    );

    details.tags = tagNamesRes.rows.map((r) => ({
      tagId: r.tag_id,
      name: r.name,
    }));

    details.sendToCustomer = sendToCustomer;
    details.createFollowUpTask = createFollowUpTask;
    
    await client.query("COMMIT");

    return successResponse(
      res,
      keysToCamelCase({
        ...action,
        created_by: formatUserObject(action.created_by_id, usersMap),
        updated_by: formatUserObject(action.updated_by_id, usersMap),
        [type?.toLowerCase()]: keysToCamelCase(details),
      }),
      "Action created successfully."
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create action error:", error);
    return errorResponse(res, 500, "Failed to create action.");
  } finally {
    client.release();
  }
};

exports.updateAction = async (req, res) => {
  const { action_id } = req.params;
  const builderId = req.user.builder_id;
  const attachment = req.file?.location || null;
  const {
    action_type_id,
    type,
    message,
    tags,
    task,
    recipient,
    title,
    date,
    start_time,
    end_time,
    location,
    select_users,
    notes,
  } = req.body;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const actionRes = await client.query(
      `SELECT * FROM actions WHERE action_id = $1 AND builder_id = $2`,
      [action_id, builderId]
    );
    if (actionRes.rowCount === 0) {
      return errorResponse(res, 404, "Action not found.");
    }
    const existingAction = actionRes.rows[0];

    if (type && type !== existingAction.type) {
      return errorResponse(res, 400, "Type mismatch with action data.");
    }

    // Update the updated_by_id and updated_at
    await client.query(
      `UPDATE actions SET updated_by_id = $1, updated_at = NOW() WHERE action_id = $2`,
      [req.user.user_id, action_id]
    );

    // Fetch updated action
    const updatedActionRes = await client.query(
      `SELECT * FROM actions WHERE action_id = $1`,
      [action_id]
    );
    const updatedAction = updatedActionRes.rows[0];

    let details = null;

    if (existingAction.type === "NOTES") {
      const oldRes = await client.query(
        `SELECT * FROM notes WHERE notes_id = $1 AND action_id = $2`,
        [action_type_id, action_id]
      );
      if (oldRes.rowCount === 0) {
        return errorResponse(res, 404, "Notes record not found.");
      }
      const oldNote = oldRes.rows[0];

      const notesRes = await client.query(
        `UPDATE notes 
           SET message = COALESCE($1, message), 
               attachment = COALESCE($2, attachment)
         WHERE notes_id = $3 AND action_id = $4 
         RETURNING *`,
        [message, attachment || oldNote.attachment, action_type_id, action_id]
      );
      details = notesRes.rows[0];

      if (
        attachment &&
        oldNote.attachment &&
        oldNote.attachment !== attachment
      ) {
        await deleteFromS3(oldNote.attachment);
      }

      if (tags && tags.length > 0) {
        const existingTagsRes = await client.query(
          `SELECT tag_id, name 
             FROM tags 
            WHERE name = ANY($1) AND builder_id = $2 AND is_deleted = false`,
          [tags, builderId]
        );
        const existingTags = existingTagsRes.rows;
        const existingTagNames = existingTags.map((t) => t.name);
        const missingTags = tags.filter((t) => !existingTagNames.includes(t));

        let newTags = [];
        if (missingTags.length > 0) {
          const insertRes = await client.query(
            `INSERT INTO tags (name, builder_id) 
               SELECT unnest($1::text[]), $2 
             RETURNING tag_id, name`,
            [missingTags, builderId]
          );
          newTags = insertRes.rows;
        }

        const allTags = [...existingTags, ...newTags];

        const tagIds = allTags.map((t) => t.tag_id);
        await client.query(
          `UPDATE notes SET tags = $1 WHERE notes_id = $2 AND action_id = $3`,
          [tagIds, action_type_id, action_id]
        );
      }
      const finalTagRes = await client.query(
        `SELECT t.tag_id, t.name
           FROM tags t
           INNER JOIN notes nt ON t.tag_id = ANY(nt.tags)
          WHERE nt.notes_id = $1`,
        [action_type_id]
      );
      details.tags = finalTagRes.rows;
    }

    if (existingAction.type === "SMS") {
      if (recipient) {
        const recipients = Array.isArray(recipient) ? recipient : [recipient];

        const contactCheckRes = await client.query(
          `SELECT leads_contact_id, name
             FROM leads_contact
            WHERE leads_contact_id = ANY($1::uuid[])
              AND lead_id = $2`,
          [recipients, existingAction.lead_id]
        );

        const foundIds = contactCheckRes.rows.map((r) => r.leads_contact_id);
        const missing = recipients.filter((id) => !foundIds.includes(id));

        if (missing.length > 0) {
          await client.query("ROLLBACK");
          return errorResponse(
            res,
            404,
            `Recipients not found: ${missing.join(", ")}`
          );
        }

        const smsRes = await client.query(
          `UPDATE sms 
              SET recipient = $1::uuid[], 
                  message = COALESCE($2, message) 
            WHERE sms_id = $3 AND action_id = $4 
            RETURNING *`,
          [recipients, message, action_type_id, action_id]
        );

        if (smsRes.rowCount === 0) {
          return errorResponse(res, 404, "SMS record not found.");
        }

        details = {
          smsId: smsRes.rows[0].sms_id,
          actionId: smsRes.rows[0].action_id,
          recipient: recipients.map((id) => {
            const contact = contactCheckRes.rows.find(
              (c) => c.leads_contact_id === id
            );
            return {
              id,
              name: contact ? contact.name : null,
            };
          }),
          message: smsRes.rows[0].message,
          isDeleted: smsRes.rows[0].is_deleted,
          createdAt: smsRes.rows[0].created_at,
          updatedAt: smsRes.rows[0].updated_at,
        };
      } else {
        const smsRes = await client.query(
          `UPDATE sms 
              SET message = COALESCE($1, message) 
            WHERE sms_id = $2 AND action_id = $3 
            RETURNING *`,
          [message, action_type_id, action_id]
        );
        if (smsRes.rowCount === 0) {
          return errorResponse(res, 404, "SMS record not found.");
        }

        const contactCheckRes = await client.query(
          `SELECT lc.leads_contact_id, lc.name
             FROM leads_contact lc
             JOIN sms s ON lc.leads_contact_id = ANY(s.recipient)
            WHERE s.sms_id = $1 AND s.action_id = $2`,
          [action_type_id, action_id]
        );

        const recipientWithNames = smsRes.rows[0].recipient.map((id) => {
          const contact = contactCheckRes.rows.find(
            (c) => c.leads_contact_id === id
          );
          return {
            id,
            name: contact ? contact.name : null,
          };
        });

        details = {
          smsId: smsRes.rows[0].sms_id,
          actionId: smsRes.rows[0].action_id,
          recipient: recipientWithNames,
          message: smsRes.rows[0].message,
          isDeleted: smsRes.rows[0].is_deleted,
          createdAt: smsRes.rows[0].created_at,
          updatedAt: smsRes.rows[0].updated_at,
        };
      }
    }

    if (existingAction.type === "APPOINTMENT") {
      const currentUsersRes = await client.query(
        `SELECT users_id, name
           FROM users 
          WHERE users_id = ANY(
            SELECT unnest(select_users) FROM appointment 
            WHERE appointment_id = $1 AND action_id = $2
          )
            AND builder_id = $3
            AND is_verified = true
            AND is_deleted = false`,
        [action_type_id, action_id, builderId]
      );
    
      let selectUsers = currentUsersRes.rows;

      if (select_users && select_users.length > 0) {
        const selectUsersRes = await client.query(
          `SELECT users_id, name
             FROM users 
            WHERE users_id = ANY($1::uuid[]) 
              AND builder_id = $2 
              AND is_verified = true 
              AND is_deleted = false`,
          [select_users, builderId]
        );

        const foundIds = selectUsersRes.rows.map((r) => r.users_id);
        const missing = select_users.filter((id) => !foundIds.includes(id));

        if (missing.length > 0) {
          await client.query("ROLLBACK");
          return errorResponse(
            res,
            404,
            `Select users not found or not verified: ${missing.join(", ")}`
          );
        }
        selectUsers = selectUsersRes.rows;
      }

      const apptRes = await client.query(
        `UPDATE appointment 
            SET title       = COALESCE($1, title),
                date        = COALESCE($2, date),
                start_time  = COALESCE($3, start_time),
                end_time    = COALESCE($4, end_time),
                location    = COALESCE($5, location),
                select_users= COALESCE($6, select_users),
                notes       = COALESCE($7, notes),
                updated_at  = NOW()
          WHERE appointment_id = $8 
            AND action_id = $9 
          RETURNING *`,
        [
          title,
          date,
          start_time,
          end_time,
          location,
          select_users,
          notes,
          action_type_id,
          action_id,
        ]
      );

      if (apptRes.rowCount === 0) {
        return errorResponse(res, 404, "Appointment record not found.");
      }

      details = apptRes.rows[0];

      details.select_users = details.select_users.map((id) => {
        const u = selectUsers.find((r) => r.users_id === id);
        return { id, name: u ? u.name : null };
      });
    }

    if (existingAction.type === "TASK") {
      const oldTaskRes = await client.query(
        `SELECT * FROM task WHERE task_id = $1 AND action_id = $2`,
        [action_type_id, action_id]
      );
      if (oldTaskRes.rowCount === 0) {
        return errorResponse(res, 404, "Task record not found.");
      }
      const oldTask = oldTaskRes.rows[0];

      let assigneeId = task?.assignee || oldTask.assignee || null;
      let assigneeData = null;
      if (assigneeId) {
        const checkAssigneeExists = await client.query(
          `SELECT users_id, name FROM users 
          WHERE users_id = $1 AND builder_id = $2 AND is_deleted = false AND is_verified = true`,
          [assigneeId, builderId]
        );
        if (checkAssigneeExists.rowCount === 0) {
          return errorResponse(res, 404, "Assignee not found or not verified.");
        }
        assigneeData = checkAssigneeExists.rows[0];
      }

      let taskTime = task?.time || oldTask.time;
      if (taskTime && /^[0-9]{1,2}$/.test(taskTime)) {
        taskTime = taskTime.padStart(2, "0") + ":00:00";
      }

      const taskRes = await client.query(
        `UPDATE task SET name = COALESCE($1, name), due_date = COALESCE($2, due_date), priority = COALESCE($3, priority),
          description = COALESCE($4, description), time = COALESCE($5, time), assignee = COALESCE($6, assignee),
          attachment = COALESCE($7, attachment)
         WHERE task_id = $8 AND action_id = $9 RETURNING *`,
        [
          task?.name,
          task?.due_date,
          task?.priority,
          task?.description,
          taskTime || null,
          assigneeId,
          attachment || oldTask.attachment,
          action_type_id,
          action_id,
        ]
      );
      details = taskRes.rows[0];

      if (
        attachment &&
        oldTask.attachment &&
        oldTask.attachment !== attachment
      ) {
        await deleteFromS3(oldTask.attachment);
      }

      details.assignee = assigneeData
        ? { id: assigneeData.users_id, name: assigneeData.name }
        : null;
    }

    // Get user details for created_by and updated_by
    const usersMap = await getUsersDetails(client, [
      updatedAction.created_by_id,
      updatedAction.updated_by_id,
    ]);

    await client.query("COMMIT");

    return successResponse(
      res,
      keysToCamelCase({
        ...updatedAction,
        created_by: formatUserObject(updatedAction.created_by_id, usersMap),
        updated_by: formatUserObject(updatedAction.updated_by_id, usersMap),
        [existingAction.type.toLowerCase()]: keysToCamelCase(details),
      }),
      "Action updated successfully."
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update action error:", err);
    return errorResponse(res, 500, "Failed to update action.");
  } finally {
    client.release();
  }
};

exports.getAction = async (req, res) => {
  const { filter = "all" } = req.query;
  const pool = getPool();
  const client = await pool.connect();
  const builderId = req.user.builder_id;
  const leadId = req.params.lead_id;

  try {
    let actionQuery = `
      SELECT a.* 
      FROM actions a 
      WHERE a.lead_id = $1 AND a.builder_id = $2
    `;
    const queryParams = [leadId, builderId];

    if (filter !== "all") {
      actionQuery += ` AND a.type = $3`;
      queryParams.push(filter.toUpperCase());
    }

    actionQuery += ` ORDER BY a.created_at DESC`;

    const actionResult = await client.query(actionQuery, queryParams);
    if (actionResult.rows.length === 0) {
      return successResponse(res, [], "No actions found.");
    }

    const actions = keysToCamelCase(actionResult.rows);
    const actionIds = actions.map((a) => a.actionId);

    // Get all user IDs for created_by and updated_by
    const allUserIds = [
      ...new Set([
        ...actions.map((a) => a.createdById),
        ...actions.map((a) => a.updatedById),
      ]),
    ].filter(Boolean);

    const usersMap = await getUsersDetails(client, allUserIds);

    const responseData = actions.map((a) => ({
      ...a,
      createdBy: formatUserObject(a.createdById, usersMap),
      updatedBy: formatUserObject(a.updatedById, usersMap),
    }));

    const attachToActions = (rows, key, foreignKey = "actionId") => {
      const grouped = rows.reduce((acc, row) => {
        acc[row[foreignKey]] = acc[row[foreignKey]] || [];
        acc[row[foreignKey]].push(row);
        return acc;
      }, {});
      responseData.forEach((action) => {
        action[key] = grouped[action.actionId] || [];
      });
    };

    if (filter === "all" || filter.toUpperCase() === "NOTES") {
      const notesRes = await client.query(
        `SELECT * FROM notes WHERE action_id = ANY($1) AND is_deleted = false`,
        [actionIds]
      );
      const notes = keysToCamelCase(notesRes.rows);

      const allTagIds = notes.flatMap((n) => n.tags || []);
      let tagsMap = {};
      if (allTagIds.length > 0) {
        const tagsRes = await client.query(
          `SELECT tag_id, name FROM tags WHERE tag_id = ANY($1) AND is_deleted = false`,
          [allTagIds]
        );
        const tags = keysToCamelCase(tagsRes.rows);
        tagsMap = Object.fromEntries(tags.map((t) => [t.tagId, t]));
      }

      const noteTaskIds = notes.filter((n) => n.taskId).map((n) => n.taskId);
      let noteTasks = [];
      if (noteTaskIds.length > 0) {
        const taskRes = await client.query(
          `SELECT * FROM task WHERE task_id = ANY($1) AND is_deleted = false`,
          [noteTaskIds]
        );
        noteTasks = keysToCamelCase(taskRes.rows);
      }

      const taskMap = Object.fromEntries(noteTasks.map((t) => [t.taskId, t]));
      notes.forEach((note) => {
        if (note.taskId) {
          note.task = taskMap[note.taskId] || null;
        }
        if (note.tags && note.tags.length > 0) {
          note.tags = note.tags.map((tid) => tagsMap[tid]).filter(Boolean);
        } else {
          note.tags = [];
        }
      });

      attachToActions(notes, "notes");
    }

    if (filter === "all" || filter.toUpperCase() === "SMS") {
      const smsRes = await client.query(
        `SELECT * FROM sms WHERE action_id = ANY($1) AND is_deleted = false`,
        [actionIds]
      );

      const smsList = keysToCamelCase(smsRes.rows);

      const allRecipientIds = smsList.flatMap((s) => s.recipient || []);
      let recipientMap = {};
      if (allRecipientIds.length > 0) {
        const contactRes = await client.query(
          `SELECT leads_contact_id, name
            FROM leads_contact
            WHERE leads_contact_id = ANY($1)`,
          [allRecipientIds]
        );
        recipientMap = Object.fromEntries(
          contactRes.rows.map((c) => [c.leads_contact_id, c.name])
        );
      }

      smsList.forEach((sms) => {
        sms.recipient = (sms.recipient || []).map((id) => ({
          id,
          name: recipientMap[id] || null,
        }));
      });

      attachToActions(smsList, "sms");
    }

    if (filter === "all" || filter.toUpperCase() === "APPOINTMENT") {
      const appointmentRes = await client.query(
        `SELECT * FROM appointment WHERE action_id = ANY($1) AND is_deleted = false`,
        [actionIds]
      );
      const appointments = keysToCamelCase(appointmentRes.rows);

      const allUserIds = appointments.flatMap((appt) => appt.selectUsers || []);
      let usersMap = {};
      if (allUserIds.length > 0) {
        const usersRes = await client.query(
          `SELECT users_id, name 
            FROM users 
            WHERE users_id = ANY($1) 
              AND builder_id = $2 
              AND is_verified = true 
              AND is_deleted = false`,
          [allUserIds, builderId]
        );
        const users = keysToCamelCase(usersRes.rows);
        usersMap = Object.fromEntries(users.map((u) => [u.usersId, u]));
      }

      appointments.forEach((appt) => {
        if (appt.selectUsers && appt.selectUsers.length > 0) {
          appt.selectUsers = appt.selectUsers.map((id) => ({
            id,
            name: usersMap[id] ? usersMap[id].name : null,
          }));
        } else {
          appt.selectUsers = [];
        }
      });

      attachToActions(appointments, "appointment");
    }

    if (filter === "all" || filter.toUpperCase() === "TASK") {
      const taskRes = await client.query(
        `SELECT * FROM task WHERE action_id = ANY($1) AND is_deleted = false`,
        [actionIds]
      );
      const tasks = keysToCamelCase(taskRes.rows);

      const allAssigneeIds = tasks
        .map((t) => t.assignee)
        .filter((id) => id !== null);

      let assigneesMap = {};
      if (allAssigneeIds.length > 0) {
        const usersRes = await client.query(
          `SELECT users_id, name 
            FROM users 
            WHERE users_id = ANY($1) 
              AND builder_id = $2 
              AND is_verified = true 
              AND is_deleted = false`,
          [allAssigneeIds, builderId]
        );
        const users = keysToCamelCase(usersRes.rows);
        assigneesMap = Object.fromEntries(users.map((u) => [u.usersId, u]));
      }

      tasks.forEach((task) => {
        if (task.assignee) {
          const u = assigneesMap[task.assignee];
          task.assignee = {
            id: task.assignee,
            name: u ? u.name : null,
          };
        } else {
          task.assignee = null;
        }
      });

      attachToActions(tasks, "task");
    }

    return successResponse(res, responseData, "Actions fetched successfully.");
  } catch (error) {
    console.error("Get action error:", error);
    return errorResponse(res, 500, "Failed to fetch actions.");
  } finally {
    client.release();
  }
};
