/**
 * TASK EXTENSION REQUESTS
 *
 * A builder asks selected stakeholders for extra days on a workflow task. The
 * request is emailed with a tokenised link and stays PENDING until the first
 * recipient responds from that email — the same accept-without-logging-in flow
 * as job completion approval, so an external party (structural engineer,
 * consultant) can decide without an account.
 *
 * Approving grows the task's `no_of_days` and re-derives the job's schedule.
 * Every estimated date in the workflow is computed from task durations
 * (workflowSchedule.service), so extending the duration and recalculating is
 * all that is needed: the task's date, its stage's date and every dependent
 * task downstream all move together. There is no second place to write.
 */
import db from "../../config/database/models/postgre-models/index.js";
import { Sequelize } from "sequelize";
import { env } from "../../config/env.config.js";
import sendEmail from "../../service/sendMail.service.js";
import { generatePresignedDownloadUrl } from "../../service/s3.service.js";
import { ensureUniqueDriveFileName } from "../../service/fileNaming.service.js";
import { recalculateJobWorkflowDates } from "../job-workflow-setting/workflowSchedule.service.js";
import {
  wrapTaskExtensionRequestHTML,
  buildDefaultExtensionBody,
} from "../../templates/job-task-workflow.template.js";

const { Op } = Sequelize;

export const EXTENSION_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

/**
 * The cap on how many extra days may be added, derived from the task's CURRENT
 * duration rather than a fixed number.
 *
 * TASK_EXTENSION_MULTIPLIER caps the TOTAL the task may reach, so the room to
 * add is that total minus what it already has:
 *
 *   max total = duration x multiplier
 *   max added = max total - duration
 *
 * At 3, a 7 day task may reach 21 days, so at most 14 more. At the default of 2
 * it may double: 7 more, 14 in total. A multiplier of 1 leaves no room at all
 * and switches extensions off.
 *
 * A task with no duration set has nothing to scale, so it cannot be extended —
 * returning 0 makes every request fail validation with a clear message rather
 * than silently allowing any value.
 */
export function maxExtensionDaysFor(durationDays) {
  const duration = Number(durationDays);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const maxTotal = Math.floor(duration * env.WORKFLOW_TASK.EXTENSION_MULTIPLIER);
  return Math.max(0, maxTotal - duration);
}

/**
 * Why a task cannot be extended: it has no duration to scale from, or the
 * multiplier leaves no room to grow. Both surface as a zero cap, and the two
 * need different wording — one is the task, the other is the configuration.
 */
function cannotExtendMessage(durationDays) {
  return Number(durationDays) > 0
    ? "Extensions are switched off for tasks in this workspace"
    : "This task has no duration set, so it cannot be extended";
}

/**
 * How many extensions a task has left.
 *
 * A chance is spent only when days actually land on the task — an APPROVED
 * request, whether the assignee added them from the emailed link or a recipient
 * granted a builder-raised request. A rejected request costs nothing, and a
 * pending one is not counted because it may still be turned down; a pending
 * request blocks a second one on its own (see the callers), so it cannot be
 * used to slip past the limit.
 *
 * @returns {Promise<{limit: number, used: number, left: number}>}
 */
export async function getExtensionAllowance(taskId, transaction = null) {
  const { JobTaskExtensionRequest } = db;
  const limit = env.WORKFLOW_TASK.EXTENSION_LIMIT;

  const used = await JobTaskExtensionRequest.count({
    where: { task_id: taskId, status: EXTENSION_STATUS.APPROVED },
    transaction,
  });

  return { limit, used, left: Math.max(0, limit - used) };
}

/** The wording every path uses when a task is out of extensions. */
function noChancesLeftMessage(limit) {
  return limit === 1
    ? "This task has already been extended once. No extension chances are left."
    : `This task has already been extended ${limit} times. No extension chances are left.`;
}

/** Load a job task with the context an extension request needs. */
async function loadJobTask(taskId, builderId, companyId) {
  const { JobTask, JobSubStage, JobProcessStage, Job, Users, Role } = db;

  const task = await JobTask.findByPk(taskId, {
    include: [
      { model: Users, as: "assigneeUser", attributes: ["users_id", "name", "email"], required: false },
      { model: Role, as: "assignee", attributes: ["role_id", "name"], required: false },
      {
        model: JobSubStage,
        as: "subStage",
        attributes: ["sub_stage_id", "name"],
        include: [{
          model: JobProcessStage,
          as: "stage",
          attributes: ["stage_id", "name", "builder_id", "company_id"],
        }],
      },
    ],
  });

  if (!task) {
    throw new Error("Task not found");
  }
  const stage = task.subStage?.stage;
  if (stage?.builder_id !== builderId && stage?.company_id !== companyId) {
    throw new Error("You can only request an extension on your own tasks");
  }

  const job = await Job.findByPk(task.job_id, {
    attributes: ["job_id", "reference_number", "builder_id"],
  });

  return { task, job, stage };
}

/**
 * What the Request Extension modal needs before the builder types anything:
 * the current duration, the cap derived from it, who can be emailed, and
 * whether a request is already open (only one may be at a time).
 */
export async function getExtensionContext(taskId, builderId, companyId, user = null) {
  const { Users, Role, JobTaskExtensionRequest, TemplateEmail } = db;
  const { task, job } = await loadJobTask(taskId, builderId, companyId);

  // Recipients are users of this builder, grouped by role in the UI. Anyone
  // without an email is dropped — they could not receive the request.
  const users = await Users.findAll({
    where: {
      builder_id: job?.builder_id ?? builderId,
      is_active: true,
      email: { [Op.ne]: null },
    },
    attributes: ["users_id", "name", "email"],
    include: [{ model: Role, as: "role", attributes: ["role_id", "name"], required: false }],
    order: [["name", "ASC"]],
  });

  const pending = await JobTaskExtensionRequest.findOne({
    where: { task_id: taskId, status: EXTENSION_STATUS.PENDING },
    order: [["createdAt", "DESC"]],
  });

  const allowance = await getExtensionAllowance(taskId);

  // The builder's saved email templates, same source and scoping as the
  // engineer mail panel — selecting one swaps the subject and body.
  const emailTemplates = await TemplateEmail.findAll({
    where: {
      is_active: true,
      [Op.or]: [
        ...(builderId ? [{ builder_id: builderId }] : []),
        ...(companyId ? [{ company_id: companyId }] : []),
      ],
    },
    attributes: ["template_email_id", "name", "subject", "email_content"],
    order: [["name", "ASC"]],
  });

  return {
    task_id: taskId,
    task_name: task.name,
    job_reference: job?.reference_number ?? null,
    current_duration_days: task.no_of_days ?? 0,
    extension_multiplier: env.WORKFLOW_TASK.EXTENSION_MULTIPLIER,
    max_extension_days: maxExtensionDaysFor(task.no_of_days),
    extension_limit: allowance.limit,
    extensions_used: allowance.used,
    extensions_left: allowance.left,
    default_subject: `Extension request: ${task.name}${job?.reference_number ? ` (Job ${job.reference_number})` : ""}`,
    // The draft the panel opens with. Returned rather than composed at send
    // time so the builder edits the wording that actually goes out.
    default_body: buildDefaultExtensionBody({
      taskName: task.name,
      jobReference: job?.reference_number ?? "",
      requestedByName: user?.name ?? "",
    }),
    email_templates: (emailTemplates || []).map((t) => ({
      template_email_id: t.template_email_id,
      name: t.name,
      subject: t.subject,
      email_content: t.email_content,
    })),
    recipients: users.map((u) => ({
      users_id: u.users_id,
      name: u.name,
      email: u.email,
      role_id: u.role?.role_id ?? null,
      role_name: u.role?.name ?? null,
    })),
    pending_request: pending
      ? {
        job_task_extension_request_id: pending.job_task_extension_request_id,
        extension_days: pending.extension_days,
        sent_at: pending.sent_at,
      }
      : null,
  };
}

/* =========================================================
   ASSIGNEE-RAISED REQUESTS (from the "Add Days" link in the
   task assignment email — token-secured, no login)
========================================================= */

/**
 * What the assignee's "Add Days" page shows before they type anything: the
 * task, the duration it currently has, and the most they may add.
 *
 * Token-secured, so it exposes only what the request needs — no job financials,
 * no user records.
 */
export async function getTaskExtensionPublicDetails(taskId) {
  const { JobTask, JobSubStage, JobProcessStage, Job, JobTaskExtensionRequest } = db;

  const task = await JobTask.findByPk(taskId, {
    attributes: [
      "job_process_task_id", "job_id", "name", "no_of_days",
      "estimated_start_date", "estimated_end_date",
    ],
    include: [{
      model: JobSubStage,
      as: "subStage",
      attributes: ["sub_stage_id", "name"],
      include: [{ model: JobProcessStage, as: "stage", attributes: ["stage_id", "name"] }],
    }],
  });

  if (!task) {
    throw new Error("Task not found");
  }

  const job = await Job.findByPk(task.job_id, { attributes: ["job_id", "reference_number"] });

  const pending = await JobTaskExtensionRequest.findOne({
    where: { task_id: taskId, status: EXTENSION_STATUS.PENDING },
    order: [["createdAt", "DESC"]],
  });

  const allowance = await getExtensionAllowance(taskId);

  return {
    task_id: taskId,
    task_name: task.name,
    job_reference: job?.reference_number ?? null,
    stage_name: task.subStage?.stage?.name ?? null,
    sub_stage_name: task.subStage?.name ?? null,
    current_duration_days: task.no_of_days ?? 0,
    max_extension_days: maxExtensionDaysFor(task.no_of_days),
    // What the duration becomes if the maximum is granted.
    max_total_duration_days: (task.no_of_days ?? 0) + maxExtensionDaysFor(task.no_of_days),
    start_date: task.estimated_start_date,
    finish_date: task.estimated_end_date,
    // How many times this task may still be extended. The page shows the count
    // and closes the form when it reaches zero.
    extension_limit: allowance.limit,
    extensions_used: allowance.used,
    extensions_left: allowance.left,
    pending_request: pending
      ? { extension_days: pending.extension_days, sent_at: pending.sent_at }
      : null,
  };
}

/**
 * The assignee adds days from the emailed link.
 *
 * Applied immediately — there is no approval step. The days go straight onto
 * the task's duration and the job's schedule is re-derived from it, so the
 * assignee is not blocked waiting on anyone. The cap still holds: the extension
 * can never exceed the duration the task already has, recomputed here from the
 * live value rather than trusting the page.
 *
 * A row is still written to job_task_extension_request, recorded as APPROVED —
 * that is the audit trail of who added time, how much, and why.
 */
export async function createAssigneeExtensionRequest(taskId, input = {}) {
  const { JobTask, JobSubStage, JobProcessStage, Job, Users, JobTaskExtensionRequest } = db;

  const task = await JobTask.findByPk(taskId, {
    include: [
      { model: Users, as: "assigneeUser", attributes: ["users_id", "name", "email"], required: false },
      {
        model: JobSubStage,
        as: "subStage",
        attributes: ["sub_stage_id", "name"],
        include: [{
          model: JobProcessStage,
          as: "stage",
          attributes: ["stage_id", "name", "builder_id", "company_id"],
        }],
      },
    ],
  });

  if (!task) {
    throw new Error("Task not found");
  }

  const reason = String(input.reason || "").trim();
  if (!reason) {
    throw new Error("A reason for the extension is required");
  }

  const extensionDays = Number(input.extension_days);
  if (!Number.isInteger(extensionDays) || extensionDays < 1) {
    throw new Error("Extension days must be a whole number greater than 0");
  }

  const maxDays = maxExtensionDaysFor(task.no_of_days);
  if (maxDays <= 0) {
    throw new Error(cannotExtendMessage(task.no_of_days));
  }
  if (extensionDays > maxDays) {
    throw new Error(`You can request a maximum of ${maxDays} extension days for this task.`);
  }

  const existing = await JobTaskExtensionRequest.findOne({
    where: { task_id: taskId, status: EXTENSION_STATUS.PENDING },
  });
  if (existing) {
    throw new Error("An extension request is already awaiting a response for this task");
  }

  const job = await Job.findByPk(task.job_id, {
    attributes: ["job_id", "reference_number", "builder_id"],
  });

  // Captured before the update below — task.update() mutates the instance, so
  // reading task.no_of_days afterwards would report the new value as the old.
  const previousDuration = task.no_of_days ?? 0;
  const newDuration = previousDuration + extensionDays;
  const subject = `Extension added: ${task.name}${job?.reference_number ? ` (Job ${job.reference_number})` : ""}`;

  return db.sequelize.transaction(async (t) => {
    // Locked before the count so two clicks on "Send Request" cannot both read
    // the same remaining chances and each add days on top of it.
    await JobTask.findByPk(taskId, { lock: t.LOCK.UPDATE, transaction: t });

    const allowance = await getExtensionAllowance(taskId, t);
    if (allowance.left <= 0) {
      throw new Error(noChancesLeftMessage(allowance.limit));
    }

    const request = await JobTaskExtensionRequest.create({
      task_id: taskId,
      job_id: task.job_id,
      builder_id: task.subStage?.stage?.builder_id ?? null,
      company_id: task.subStage?.stage?.company_id ?? null,
      subject,
      reason,
      extension_days: extensionDays,
      // Applied as asked — nobody trimmed it, so granted equals requested.
      approved_days: extensionDays,
      requested_duration_days: previousDuration,
      max_extension_days: maxDays,
      recipients: [],
      attachments: [],
      status: EXTENSION_STATUS.APPROVED,
      // Attributed to the assignee — they added it, even though they were not
      // signed in when they did.
      requested_by: task.assigneeUser?.users_id ?? null,
      responded_by_email: task.assigneeUser?.email ?? null,
      responded_at: new Date(),
      sent_at: new Date(),
    }, { transaction: t });

    // This request is now one of them, so the count includes it.
    const extensionsLeft = Math.max(0, allowance.left - 1);

    await task.update({ no_of_days: newDuration }, { transaction: t });

    // Re-derive every estimated date in the job from the new duration — this is
    // what moves the task, its stage and all dependent tasks.
    await recalculateJobWorkflowDates(task.job_id, { transaction: t });

    return {
      job_task_extension_request_id: request.job_task_extension_request_id,
      task_id: taskId,
      status: request.status,
      extension_days: extensionDays,
      max_extension_days: maxDays,
      previous_duration_days: previousDuration,
      new_total_duration_days: newDuration,
      extension_limit: allowance.limit,
      extensions_used: allowance.used + 1,
      extensions_left: extensionsLeft,
    };
  });
}

/** Persist uploaded files as DriveFile rows and return their ids. */
async function storeAttachments(files, { taskId, jobId, user }) {
  const { DriveFile, Job, Opportunity } = db;
  if (!files?.length) return [];

  let leadId = null;
  if (jobId) {
    const job = await Job.findByPk(jobId, { include: [{ model: Opportunity, as: "opportunity" }] });
    leadId = job?.opportunity?.leads_id || null;
  }

  const created = [];
  for (const file of files) {
    const ext = file.originalname.substring(file.originalname.lastIndexOf(".")).replace(".", "");
    const row = await DriveFile.create({
      company_id: user?.company_id,
      builder_id: user?.builder_id,
      uploaded_by: user?.users_id,
      lead_id: leadId,
      reference_id: taskId,
      reference_type: "JobTaskExtensionRequest",
      original_name: file.originalname,
      file_name: await ensureUniqueDriveFileName(file.key.split("/").pop()),
      s3_key: file.key,
      file_extension: ext,
      mime_type: file.mimetype,
      size: file.size,
    });
    created.push(row.file_id);
  }
  return created;
}

/** Resolve DriveFile ids into the shape the UI renders. */
async function resolveAttachments(fileIds) {
  const { DriveFile } = db;
  if (!fileIds?.length) return [];

  const files = await DriveFile.findAll({ where: { file_id: { [Op.in]: fileIds } } });
  return Promise.all(
    files.map(async (f) => {
      const presigned = await generatePresignedDownloadUrl(f.s3_key).catch(() => null);
      return {
        id: f.file_id,
        name: f.original_name,
        size: f.size ? `${(Number(f.size) / (1024 * 1024)).toFixed(1)} MB` : undefined,
        url: presigned?.success ? presigned.url : null,
      };
    }),
  );
}

/**
 * Raise an extension request and email the recipients.
 *
 * Every rule is enforced here rather than trusting the client: the cap is
 * recomputed from the task's live duration, and the recipients are resolved
 * from their user ids so a spoofed address can never be mailed.
 */
export async function createExtensionRequest(taskId, payload, files, user) {
  const { Users, Role, JobTaskExtensionRequest } = db;
  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  const { task, job } = await loadJobTask(taskId, builderId, companyId);

  const reason = (payload.reason || "").trim();
  if (!reason) {
    throw new Error("A reason for the extension is required");
  }

  const extensionDays = Number(payload.extension_days);
  if (!Number.isInteger(extensionDays) || extensionDays < 1) {
    throw new Error("Extension days must be a whole number greater than 0");
  }

  const maxDays = maxExtensionDaysFor(task.no_of_days);
  if (maxDays <= 0) {
    throw new Error(cannotExtendMessage(task.no_of_days));
  }
  if (extensionDays > maxDays) {
    throw new Error(`You can request a maximum of ${maxDays} extension days for this task.`);
  }

  const existing = await JobTaskExtensionRequest.findOne({
    where: { task_id: taskId, status: EXTENSION_STATUS.PENDING },
  });
  if (existing) {
    throw new Error("An extension request is already awaiting a response for this task");
  }

  // Same allowance as the assignee's own requests — the two share the count, so
  // a task cannot be extended more times by routing the ask through the builder.
  const allowance = await getExtensionAllowance(taskId);
  if (allowance.left <= 0) {
    throw new Error(noChancesLeftMessage(allowance.limit));
  }

  const recipientIds = Array.isArray(payload.recipient_user_ids) ? payload.recipient_user_ids : [];
  if (!recipientIds.length) {
    throw new Error("Select at least one recipient");
  }

  const recipientUsers = await Users.findAll({
    where: {
      users_id: { [Op.in]: recipientIds },
      builder_id: job?.builder_id ?? builderId,
      is_active: true,
    },
    attributes: ["users_id", "name", "email"],
    include: [{ model: Role, as: "role", attributes: ["name"], required: false }],
  });

  const recipients = recipientUsers
    .filter((u) => !!u.email)
    .map((u) => ({
      usersId: u.users_id,
      name: u.name,
      email: u.email,
      roleName: u.role?.name ?? null,
    }));

  if (!recipients.length) {
    throw new Error("None of the selected recipients have an email address");
  }

  const attachmentIds = await storeAttachments(files, { taskId, jobId: task.job_id, user });

  const subject = (payload.subject || "").trim()
    || `Extension request: ${task.name}${job?.reference_number ? ` (Job ${job.reference_number})` : ""}`;

  const request = await JobTaskExtensionRequest.create({
    task_id: taskId,
    job_id: task.job_id,
    builder_id: builderId,
    company_id: companyId,
    subject,
    // What the builder actually composed. Stored so the sent message can be
    // shown back later rather than being re-derived and possibly differing.
    email_body: payload.email_body || null,
    reason,
    extension_days: extensionDays,
    requested_duration_days: task.no_of_days,
    max_extension_days: maxDays,
    recipients,
    attachments: attachmentIds,
    status: EXTENSION_STATUS.PENDING,
    requested_by: user?.users_id ?? null,
    sent_at: new Date(),
  });

  await emailRecipients({ request, task, job, requestedByName: user?.name });

  return {
    job_task_extension_request_id: request.job_task_extension_request_id,
    task_id: taskId,
    status: request.status,
    extension_days: extensionDays,
    max_extension_days: maxDays,
    recipients,
    attachments: await resolveAttachments(attachmentIds),
    sent_at: request.sent_at,
  };
}

/** Compose and queue the request email for every recipient. */
async function emailRecipients({ request, task, job, requestedByName }) {
  const link = env.EMAIL?.FRONTEND_BASE_URL
    ? `${env.EMAIL.FRONTEND_BASE_URL}/external?Type=taskextension&id=${request.job_task_extension_request_id}`
    : "#";

  for (const recipient of request.recipients || []) {
    const { subject, html, text } = wrapTaskExtensionRequestHTML({
      recipientName: recipient.name,
      taskName: task.name,
      jobReference: job?.reference_number ?? "",
      stageName: task.subStage?.stage?.name ?? "",
      currentDurationDays: request.requested_duration_days,
      requestedDays: request.extension_days,
      maxDays: request.max_extension_days,
      reason: request.reason,
      reviewUrl: link,
      requestedByName,
      // The message the builder wrote and reviewed in the panel.
      bodyHtml: request.email_body || null,
    });

    // The builder may have edited the subject in the modal; theirs wins.
    await sendEmail(recipient.email, request.subject || subject, text, html);
  }
}

/**
 * The approver's view, reached from the emailed link. Token-secured, so it
 * exposes only what the decision needs — no job financials, no user ids.
 */
export async function getExtensionRequestPublicDetails(requestId) {
  const { JobTaskExtensionRequest, JobTask, Job, Users } = db;

  const request = await JobTaskExtensionRequest.findByPk(requestId, {
    include: [
      { model: JobTask, as: "task", attributes: ["job_process_task_id", "name", "no_of_days", "estimated_end_date"] },
      { model: Job, as: "job", attributes: ["job_id", "reference_number"] },
      { model: Users, as: "requestedByUser", attributes: ["name"], required: false },
    ],
  });

  if (!request) {
    throw new Error("Extension request not found");
  }

  // The cap is recomputed from the task's LIVE duration, not the snapshot, so
  // the number the approver is offered matches what respond() will accept.
  const currentDuration = request.task?.no_of_days ?? request.requested_duration_days;

  return {
    job_task_extension_request_id: request.job_task_extension_request_id,
    status: request.status,
    subject: request.subject,
    reason: request.reason,
    // What was asked for, versus what may be granted and what was.
    extension_days: request.extension_days,
    approved_days: request.approved_days,
    max_extension_days: maxExtensionDaysFor(currentDuration),
    current_duration_days: currentDuration,
    task_name: request.task?.name ?? null,
    job_reference: request.job?.reference_number ?? null,
    requested_by: request.requestedByUser?.name ?? null,
    sent_at: request.sent_at,
    responded_at: request.responded_at,
    response_comments: request.response_comments,
    attachments: await resolveAttachments(request.attachments),
  };
}

/**
 * Record a recipient's decision.
 *
 * The responder decides how many days are actually granted — `approved_days`
 * may differ from what the builder asked for, and omitting it grants exactly
 * the request. The cap is recomputed here from the task's CURRENT duration
 * rather than trusting the snapshot taken when the request was raised, because
 * the duration can have moved in between.
 *
 * Approving adds the granted days to the task's duration and re-derives the
 * job's whole schedule, which is what moves the task's date, its stage's date
 * and every dependent task. Guarded against a second response: whoever answers
 * first settles it, and later clicks on the same emailed link are told so.
 */
export async function respondToExtensionRequest(requestId, input = {}) {
  const { JobTaskExtensionRequest, JobTask } = db;

  const decision = String(input.decision || "").toUpperCase();
  if (![EXTENSION_STATUS.APPROVED, EXTENSION_STATUS.REJECTED].includes(decision)) {
    throw new Error("Decision must be APPROVED or REJECTED");
  }

  return db.sequelize.transaction(async (t) => {
    const request = await JobTaskExtensionRequest.findByPk(requestId, { transaction: t });
    if (!request) {
      throw new Error("Extension request not found");
    }
    if (request.status !== EXTENSION_STATUS.PENDING) {
      throw new Error(`This request has already been ${request.status.toLowerCase()}`);
    }

    const task = await JobTask.findByPk(request.task_id, { transaction: t });
    if (!task) {
      throw new Error("The task this request belongs to no longer exists");
    }

    let approvedDays = null;
    if (decision === EXTENSION_STATUS.APPROVED) {
      // Re-checked at approval time, not just when the request was raised: the
      // task may have been extended in between, spending the last chance.
      const allowance = await getExtensionAllowance(request.task_id, t);
      if (allowance.left <= 0) {
        throw new Error(noChancesLeftMessage(allowance.limit));
      }

      approvedDays = input.approved_days === undefined || input.approved_days === null
        ? request.extension_days
        : Number(input.approved_days);

      if (!Number.isInteger(approvedDays) || approvedDays < 1) {
        throw new Error("Approved days must be a whole number greater than 0");
      }

      const maxDays = maxExtensionDaysFor(task.no_of_days);
      if (maxDays <= 0) {
        throw new Error(cannotExtendMessage(task.no_of_days));
      }
      if (approvedDays > maxDays) {
        throw new Error(`You can approve a maximum of ${maxDays} extension days for this task.`);
      }
    }

    await request.update({
      status: decision,
      approved_days: approvedDays,
      response_comments: input.comments ? String(input.comments).slice(0, 1000) : null,
      responded_by_email: input.responded_by_email || null,
      responded_at: new Date(),
    }, { transaction: t });

    let newDuration = task.no_of_days;
    if (decision === EXTENSION_STATUS.APPROVED) {
      newDuration = (task.no_of_days || 0) + approvedDays;
      await task.update({ no_of_days: newDuration }, { transaction: t });

      // Re-derive every estimated date in the job from the new duration. This
      // is what updates the task, its stage and all dependent tasks — there is
      // no separate due-date column to write.
      await recalculateJobWorkflowDates(request.job_id, { transaction: t });
    }

    return {
      job_task_extension_request_id: requestId,
      status: decision,
      requested_days: request.extension_days,
      approved_days: approvedDays,
      new_duration_days: newDuration,
      responded_at: request.responded_at,
    };
  });
}

export default {
  maxExtensionDaysFor,
  getExtensionAllowance,
  getExtensionContext,
  createExtensionRequest,
  getTaskExtensionPublicDetails,
  createAssigneeExtensionRequest,
  getExtensionRequestPublicDetails,
  respondToExtensionRequest,
  EXTENSION_STATUS,
};
