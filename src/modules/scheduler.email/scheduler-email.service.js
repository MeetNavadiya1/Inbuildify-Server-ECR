import db from "../../config/database/models/postgre-models/index.js";
import { Op, Sequelize } from "sequelize";
import { deleteFromS3 } from "../../utils/s3Upload.js";

export async function getSchedulerEmailsService(user, filters) {
  const { is_active } = filters;
  const builderId = user?.builder_id || null;
  const companyId = user?.company_id || null;

  const whereScope = {
    [Op.or]: [],
  };
  if (builderId) {
    whereScope[Op.or].push({ builder_id: builderId });
  }
  if (companyId) {
    whereScope[Op.or].push({ company_id: companyId });
  }

  if (whereScope[Op.or].length === 0) {
    return {
      scheduler_emails: [],
      counts: { total: 0, active: 0, inactive: 0 },
      message: "No context provided.",
    };
  }

  const countData = await db.SchedulerEmail.findOne({
    where: whereScope,
    attributes: [
      [Sequelize.fn("count", Sequelize.col("*")), "total_count"],
      [Sequelize.literal("COUNT(CASE WHEN is_active = true THEN 1 END)"), "active_count"],
      [Sequelize.literal("COUNT(CASE WHEN is_active = false THEN 1 END)"), "inactive_count"],
    ],
    raw: true,
  });

  const counts = {
    total: parseInt(countData?.total_count || 0, 10),
    active: parseInt(countData?.active_count || 0, 10),
    inactive: parseInt(countData?.inactive_count || 0, 10),
  };

  const staticRecords = [
    { name: "Daily Report Summary", frequency: "daily", subject: "Daily Report Summary", messageBody: "This is a daily report summary containing all project updates, task completions, and important notifications for today.", noOfActionDays: 1 },
    { name: "Weekly Progress Update", frequency: "weekly", subject: "Weekly Progress Update", messageBody: "Weekly progress update showing completed tasks, milestones achieved, and upcoming priorities for the week.", noOfActionDays: 7 },
    { name: "Monthly Performance Review", frequency: "monthly", subject: "Monthly Performance Review", messageBody: "Monthly performance review with detailed analytics, KPI tracking, and performance metrics for all projects.", noOfActionDays: 30 },
    { name: "Project Status Update", frequency: "daily", subject: "Project Status Update", messageBody: "Current project status including timeline, budget, resource allocation, and potential risks.", noOfActionDays: 1 },
    { name: "Team Notification", frequency: "daily", subject: "Team Notification", messageBody: "Team notifications including member updates, task assignments, and collaboration alerts.", noOfActionDays: 1 },
    { name: "Task Completion Report", frequency: "weekly", subject: "Task Completion Report", messageBody: "Weekly task completion report showing finished tasks, pending items, and completion rates.", noOfActionDays: 7 },
    { name: "Deadline Reminder", frequency: "daily", subject: "Deadline Reminder", messageBody: "Daily reminder for upcoming deadlines, task due dates, and critical project milestones.", noOfActionDays: 1 },
    { name: "Meeting Schedule", frequency: "weekly", subject: "Meeting Schedule", messageBody: "Weekly meeting schedule with agenda, participants, and action items from previous meetings.", noOfActionDays: 7 },
    { name: "Budget Overview", frequency: "monthly", subject: "Budget Overview", messageBody: "Monthly budget overview showing expenditures, remaining budget, and financial forecasts.", noOfActionDays: 30 },
    { name: "Resource Allocation", frequency: "weekly", subject: "Resource Allocation", messageBody: "Weekly resource allocation report showing team assignments, equipment usage, and availability.", noOfActionDays: 7 },
    { name: "Quality Check Report", frequency: "daily", subject: "Quality Check Report", messageBody: "Daily quality control report including inspections, compliance checks, and quality metrics.", noOfActionDays: 1 },
    { name: "Safety Inspection", frequency: "weekly", subject: "Safety Inspection", messageBody: "Weekly safety inspection report with hazard assessments, safety compliance, and incident reports.", noOfActionDays: 7 },
    { name: "Client Communication", frequency: "daily", subject: "Client Communication", messageBody: "Daily client communication summary including emails, meetings, and project updates shared with clients.", noOfActionDays: 1 },
    { name: "Vendor Update", frequency: "weekly", subject: "Vendor Update", messageBody: "Weekly vendor update showing supplier performance, deliveries, and procurement activities.", noOfActionDays: 7 },
    { name: "System Maintenance", frequency: "monthly", subject: "System Maintenance", messageBody: "Monthly system maintenance report including updates, backups, and technical performance metrics.", noOfActionDays: 30 },
  ];

  const filterSensitive = (row) => {
    const { company_id, builder_id, created_at, updated_at, created_by, updated_by, ...filtered } = row;
    return filtered;
  };

  if (counts.total === 0) {
    const insertData = staticRecords.map((record) => ({
      company_id: companyId,
      builder_id: builderId,
      name: record.name,
      frequency: record.frequency,
      send_to_all_active_users: true,
      notification_recipient_users: [],
      reply_to_users: [],
      exclude_recipients: [],
      subject: record.subject,
      message_body: record.messageBody,
      no_of_action_days: record.noOfActionDays,
      no_record_message: false,
      no_record_message_body: null,
      attach_files: null,
      is_active: true,
      created_by: user?.users_id,
      updated_by: user?.users_id,
    }));

    const newRecords = await db.SchedulerEmail.bulkCreate(insertData, { returning: true });

    return {
      scheduler_emails: newRecords.map((r) => filterSensitive(r.toJSON())),
      counts: { total: 15, active: 15, inactive: 0 },
      message: "15 default scheduler emails created and fetched successfully.",
    };
  }

  const queryWhere = { ...whereScope };
  if (is_active !== undefined) {
    queryWhere.is_active = is_active === "true" || is_active === true;
  }

  const records = await db.SchedulerEmail.findAll({
    where: queryWhere,
    order: [["created_at", "ASC"]],
    limit: 15,
  });

  return {
    scheduler_emails: records.map(r => filterSensitive(r.toJSON())),
    counts,
    message: "Scheduler emails fetched successfully.",
  };
}

export async function updateSchedulerEmailService(user, scheduler_email_id, payload, file) {
  const { builder_id, company_id, users_id: userId } = user;

  let {
    name,
    frequency,
    send_to_all_active_users,
    notification_recipient_users,
    reply_to_users,
    exclude_recipients,
    subject,
    message_body,
    no_of_action_days,
    no_record_message,
    no_record_message_body,
  } = payload;

  let attach_files = undefined;
  if (file) {
    attach_files = file.location;
  } else if (Object.prototype.hasOwnProperty.call(payload, "attach_files")) {
    attach_files = payload.attach_files || null;
  }

  // Validate exclude_recipients field
  if (exclude_recipients !== undefined) {
    if (send_to_all_active_users === false) {
      const error = new Error("exclude_recipients field can only be used when send_to_all_active_users is true");
      error.statusCode = 400;
      throw error;
    }

    if (!Array.isArray(exclude_recipients)) {
      const error = new Error("exclude_recipients must be an array of user IDs");
      error.statusCode = 400;
      throw error;
    }
  }

  const whereScope = {
    [Op.or]: [],
  };
  if (builder_id) {
    whereScope[Op.or].push({ builder_id });
  }
  if (company_id) {
    whereScope[Op.or].push({ company_id });
  }

  const existing = await db.SchedulerEmail.findOne({
    where: {
      scheduler_email_id,
      [Op.and]: [
        whereScope,
        { is_active: true },
      ],
    },
  });

  if (!existing) {
    const error = new Error("Scheduler email not found or you are not authorized to update it.");
    error.statusCode = 404;
    throw error;
  }

  if (
    !name &&
    !frequency &&
    send_to_all_active_users === undefined &&
    (!notification_recipient_users || notification_recipient_users.length === 0) &&
    (!reply_to_users || reply_to_users.length === 0) &&
    !subject &&
    !message_body &&
    no_of_action_days === undefined &&
    no_record_message === undefined &&
    no_record_message_body === undefined &&
    attach_files === undefined
  ) {
    const error = new Error("At least one field must be provided to update.");
    error.statusCode = 400;
    throw error;
  }

  if (name) {
    const duplicate = await db.SchedulerEmail.findOne({
      where: {
        name: name.trim(),
        [Op.and]: [whereScope],
        scheduler_email_id: { [Op.ne]: scheduler_email_id },
      },
    });

    if (duplicate) {
      const error = new Error("A scheduler email with this name already exists for this builder/company.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (no_record_message === false && no_record_message_body) {
    const error = new Error("Cannot provide 'no_record_message_body' when 'no_record_message' is false.");
    error.statusCode = 400;
    throw error;
  }

  // Validate users existence
  const validateUsers = async (userIds, fieldName) => {
    if (userIds && userIds.length > 0) {
      const count = await db.Users.count({
        where: {
          users_id: { [Op.in]: userIds },
          is_deleted: false,
          ...(fieldName === "exclude recipients" ? { is_verified: true } : {}),
        },
      });
      if (count !== userIds.length) {
        const error = new Error(`One or more provided ${fieldName} are invalid.`);
        error.statusCode = 400;
        throw error;
      }
    }
  };

  await validateUsers(notification_recipient_users, "notification recipient users");
  await validateUsers(reply_to_users, "reply-to users");
  await validateUsers(exclude_recipients, "exclude recipients");

  if (no_record_message === undefined && no_record_message_body !== undefined) {
    if (existing.no_record_message === false) {
      const error = new Error("You cannot update 'no_record_message_body' when 'no_record_message' is false.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (no_record_message === false) {
    no_record_message_body = null;
  }

  // Handle S3 deletion
  if (Object.prototype.hasOwnProperty.call(payload, "attach_files") || file) {
    const newAttachFiles = attach_files;
    if (existing.attach_files && existing.attach_files !== newAttachFiles) {
      await deleteFromS3(existing.attach_files);
    }
  }

  const [updatedCount, updatedRows] = await db.SchedulerEmail.update({
    name: name ? name.trim() : undefined,
    frequency,
    send_to_all_active_users,
    notification_recipient_users,
    reply_to_users,
    exclude_recipients,
    subject: subject ? subject.trim() : undefined,
    message_body: message_body ? message_body.trim() : undefined,
    no_of_action_days,
    no_record_message,
    no_record_message_body,
    attach_files,
    updated_by: userId,
  }, {
    where: { scheduler_email_id },
    returning: true,
  });

  const filterSensitive = (row) => {
    const { company_id, builder_id, created_at, updated_at, created_by, updated_by, ...filtered } = row;
    return filtered;
  };

  return filterSensitive(updatedRows[0].get({ plain: true }));
}

export async function toggleSchedulerEmailStatusService(user, scheduler_email_id) {
  const { builder_id, company_id, users_id: userId } = user;

  const whereScope = {
    [Op.or]: [],
  };
  if (builder_id) {
    whereScope[Op.or].push({ builder_id });
  }
  if (company_id) {
    whereScope[Op.or].push({ company_id });
  }

  const existing = await db.SchedulerEmail.findOne({
    where: {
      scheduler_email_id,
      [Op.and]: [whereScope],
    },
  });

  if (!existing) {
    const error = new Error("Scheduler email not found or you are not authorized to update it.");
    error.statusCode = 404;
    throw error;
  }

  const newStatus = !existing.is_active;

  const [updatedCount, updatedRows] = await db.SchedulerEmail.update({
    is_active: newStatus,
    updated_by: userId,
  }, {
    where: { scheduler_email_id },
    returning: true,
  });

  const filterSensitive = (row) => {
    const { company_id, builder_id, created_at, updated_at, created_by, updated_by, ...filtered } = row;
    return filtered;
  };

  return {
    record: filterSensitive(updatedRows[0].get({ plain: true })),
    newStatus,
  };
}
