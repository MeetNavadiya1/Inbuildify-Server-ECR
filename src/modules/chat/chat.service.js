import { Op, QueryTypes } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { ACTIONS, MODULES, ROLES, SCOPES, getRoleScope } from "../../constants/rbac.js";
import { applyTenantScope } from "../../helper/rbac.helper.js";
import { resolvePermission } from "../../helper/permissionResolver.helper.js";
import {
  sampleDataReadOnlyError,
  sampleDataSqlScope,
} from "../../config/database/models/postgre-models/sampleDataFlag.js";
import { CHAT_EVENT, publishChatEvent } from "./chat.events.js";
import { generatePresignedDownloadUrl } from "../../service/s3.service.js";
import { copyS3Object, deleteFromS3 } from "../../utils/s3Upload.js";
import { extensionOf, isAllowedDocumentStoreFile } from "../../utils/uploadFileTypes.js";
import { PERMISSION_RANK, resolvePermission as resolveDrivePermission } from "../drive/drive.permissions.js";

// ─── Lead / Job chat ─────────────────────────────────────────────────────────
//
// One thread per build: a lead and the job it becomes share the lead's thread
// (see conversationWhere); only a job without a lead has its own. Who may read
// or post in a thread is
// never stored: every call resolves it again from the lead/job itself, using
// the same rules as the record's own detail endpoint, so a user who cannot open
// the lead or job cannot reach its chat by changing the id in the URL — and
// loses the chat the moment they lose the record.
//
//   Contact (customer)   lead: linked in leads_contact_map
//                        job:  job.customer_contact_id, or linked to its lead
//   Staff                READ on the LEAD / JOB module, plus the tenant and the
//                        role's row scope:
//                          Sales Executive  lead.assignee_id = self
//                          Agent            lead.created_by = self
//                          Site Supervisor  job.supervisor_id = self (or a job
//                                           role assignment); no lead threads
//                          Permits / Colour Consultant / Draft Person
//                                           job_role_assignment row; no lead
//                                           threads
//                          Builder-tier and company admins: every lead/job in
//                          their tenant; Super Admin: everything
//
// A denied record answers 404 rather than 403 so the response never confirms
// that an id exists in someone else's tenant.
//
// Read/unread is a per-user watermark (chat_participant.last_read_at): a
// message is unread for a user when someone else sent it after that user's
// watermark. Watermarks are always set from message timestamps, never from the
// clock, so app and database clocks cannot disagree about what was read.

export const CHAT_ENTITY = Object.freeze({ LEAD: "LEAD", JOB: "JOB" });
export const PARTICIPANT_TYPE = Object.freeze({ CONTACT: "CONTACT", STAFF: "STAFF" });

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_ATTACHMENTS = 5;
// S-Drive picks: the drive's own upload cap. They are copied inside S3, so
// unlike a chat upload nothing large crosses the network on send.
const MAX_DRIVE_ATTACHMENT_BYTES = 50 * 1024 * 1024;
// Pre-2007 Office files the drive no longer accepts but may still hold.
const LEGACY_DRIVE_EXTENSIONS = new Set(["doc", "xls"]);

/**
 * What may be sent from S-Drive: whatever the drive stores (PDF, Word, Excel,
 * images — never SVG), plus legacy .doc/.xls files already in it.
 */
const isSendableDriveFile = (name, mimeType) =>
  isAllowedDocumentStoreFile({ originalname: name, mimetype: mimeType }) ||
  LEGACY_DRIVE_EXTENSIONS.has(extensionOf(name));
const CHAT_ATTACHMENT_PREFIX = "chat-attachments";
const DEFAULT_PAGE_SIZE = 30;
// Long enough that an open chat does not go stale mid-session; a reload or
// reconnect catch-up signs fresh ones.
const ATTACHMENT_URL_TTL = 6 * 60 * 60;

const notFound = () => ({ status: 404, message: "Chat not found or you do not have access to it." });

const userIdOf = (user) => user?.users_id || user?.id || null;

const participantTypeOf = (user) =>
  user?.role_name === ROLES.CONTACT ? PARTICIPANT_TYPE.CONTACT : PARTICIPANT_TYPE.STAFF;

/** builder OR company — the tenant predicate the lead detail and the contact portal use. */
function tenantOr(user) {
  const or = [];
  if (user?.builder_id) {
    or.push({ builder_id: user.builder_id });
  }
  if (user?.company_id) {
    or.push({ company_id: user.company_id });
  }
  return or;
}

async function assertCanRead(user, moduleName) {
  const allowed = await resolvePermission(user, moduleName, ACTIONS.READ);
  if (!allowed) {
    throw { status: 403, message: `Forbidden: your role cannot view this ${moduleName}.` };
  }
}

// ─── Access resolution ───────────────────────────────────────────────────────

async function resolveLeadAccess(leadsId, user) {
  const { Leads, LeadsContactMap } = db;
  const userId = userIdOf(user);
  const roleName = user?.role_name;
  const scope = getRoleScope(roleName);

  if (!userId || !scope) {
    throw notFound();
  }

  const where = { leads_id: leadsId };
  const include = [];

  if (scope !== SCOPES.PLATFORM) {
    const or = tenantOr(user);
    if (!or.length) {
      throw notFound();
    }
    where[Op.or] = or;
  }

  if (roleName === ROLES.CONTACT) {
    include.push({
      model: LeadsContactMap,
      as: "contactMaps",
      where: { contact_id: userId },
      required: true,
      attributes: [],
    });
  } else {
    await assertCanRead(user, MODULES.LEAD);
    switch (scope) {
    case SCOPES.ASSIGNED:
      where.assignee_id = userId;
      break;
    case SCOPES.SELF:
      where.created_by = userId;
      break;
    case SCOPES.SITE_ASSIGNED:
    case SCOPES.JOB_ASSIGNED:
    case SCOPES.JOB_ONLY:
      // Job-level roles: assigned to jobs, never to leads.
      throw notFound();
    default:
      break;
    }
  }

  const lead = await Leads.findOne({
    where,
    include,
    attributes: ["leads_id", "company_id", "builder_id", "reference_number", "name", "is_sample_data"],
  });
  if (!lead) {
    throw notFound();
  }

  // The job this lead became, if any — the build's one thread is shared with
  // it, so its room hears this lead's messages and its customer is a reader.
  const [linkedJob] = await db.sequelize.query(
    `SELECT j.job_id, j.customer_contact_id
       FROM job j
       JOIN opportunity o ON o.opportunity_id = j.opportunity_id
      WHERE o.leads_id = :leadsId
      ORDER BY j.created_at DESC
      LIMIT 1`,
    { replacements: { leadsId: lead.leads_id }, type: QueryTypes.SELECT },
  );

  return {
    entityType: CHAT_ENTITY.LEAD,
    leadsId: lead.leads_id,
    jobId: null,
    linkedJobId: linkedJob?.job_id || null,
    companyId: lead.company_id,
    builderId: lead.builder_id,
    referenceNumber: lead.reference_number,
    customerName: lead.name,
    customerContactId: linkedJob?.customer_contact_id || null,
    isSampleData: lead.is_sample_data === true,
  };
}

async function resolveJobAccess(jobId, user) {
  const { Job, Opportunity, Leads, LeadsContactMap, JobRoleAssignment } = db;
  const userId = userIdOf(user);
  const roleName = user?.role_name;
  const scope = getRoleScope(roleName);
  const isContact = roleName === ROLES.CONTACT;

  if (!userId || !scope) {
    throw notFound();
  }

  const where = { job_id: jobId };
  if (isContact) {
    // Same predicate as the contact's build tracker (_buildContactJobScope).
    const or = tenantOr(user);
    if (!or.length) {
      throw notFound();
    }
    where[Op.or] = or;
  } else {
    await assertCanRead(user, MODULES.JOB);
    // Same predicate as JobService._buildTenantScope.
    Object.assign(where, applyTenantScope({}, user));
  }

  const job = await Job.findOne({
    where,
    attributes: [
      "job_id",
      "reference_number",
      "company_id",
      "builder_id",
      "supervisor_id",
      "customer_contact_id",
      "is_sample_data",
    ],
    include: [
      {
        model: Opportunity,
        as: "opportunity",
        attributes: ["leads_id"],
        required: false,
        include: [
          {
            model: Leads,
            as: "lead",
            attributes: ["leads_id", "name", "assignee_id", "created_by"],
            required: false,
          },
        ],
      },
    ],
  });
  if (!job) {
    throw notFound();
  }

  const lead = job.opportunity?.lead || null;
  const leadsId = job.opportunity?.leads_id || lead?.leads_id || null;

  const isJobRoleAssigned = async () =>
    (await JobRoleAssignment.count({ where: { job_id: job.job_id, user_id: userId } })) > 0;

  let allowed;
  if (isContact) {
    allowed =
      job.customer_contact_id === userId ||
      (!!leadsId && (await LeadsContactMap.count({ where: { leads_id: leadsId, contact_id: userId } })) > 0);
  } else {
    switch (scope) {
    case SCOPES.ASSIGNED:
      allowed = !!lead && lead.assignee_id === userId;
      break;
    case SCOPES.SELF:
      allowed = !!lead && lead.created_by === userId;
      break;
    case SCOPES.SITE_ASSIGNED:
      allowed = job.supervisor_id === userId || (await isJobRoleAssigned());
      break;
    case SCOPES.JOB_ASSIGNED:
      allowed = await isJobRoleAssigned();
      break;
    case SCOPES.JOB_ONLY:
      allowed = false;
      break;
    default:
      allowed = true;
    }
  }
  if (!allowed) {
    throw notFound();
  }

  return {
    entityType: CHAT_ENTITY.JOB,
    leadsId,
    jobId: job.job_id,
    companyId: job.company_id,
    builderId: job.builder_id,
    referenceNumber: job.reference_number,
    customerName: lead?.name || null,
    customerContactId: job.customer_contact_id,
    isSampleData: job.is_sample_data === true,
  };
}

/**
 * The single gate every chat call goes through. Throws 404 when the caller may
 * not reach this lead/job, 403 when their role cannot read the module at all.
 */
export async function resolveChatAccess(entityType, entityId, user) {
  if (entityType === CHAT_ENTITY.LEAD) {
    return resolveLeadAccess(entityId, user);
  }
  if (entityType === CHAT_ENTITY.JOB) {
    return resolveJobAccess(entityId, user);
  }
  throw { status: 400, message: "entity_type must be LEAD or JOB." };
}

// ─── Conversation helpers ────────────────────────────────────────────────────

/**
 * One thread per build: a lead and the job it turns into share the lead's
 * thread, reached from either record. Only a job with no originating lead has
 * a JOB thread of its own. (Earlier job threads were folded in by the
 * 20260929140000 migration.)
 */
function conversationWhere(access) {
  return access.leadsId
    ? { entity_type: CHAT_ENTITY.LEAD, leads_id: access.leadsId }
    : { entity_type: CHAT_ENTITY.JOB, job_id: access.jobId };
}

async function findConversation(access, transaction = null) {
  return db.ChatConversation.findOne({ where: conversationWhere(access), transaction });
}

/**
 * Create-or-get, safe under concurrency: two first messages sent at once both
 * land in the same thread instead of one failing on the unique index.
 */
async function getOrCreateConversation(access, transaction) {
  const byLead = !!access.leadsId;
  const conflictTarget = byLead
    ? "(leads_id) WHERE entity_type = 'LEAD'"
    : "(job_id) WHERE entity_type = 'JOB'";

  await db.sequelize.query(
    `INSERT INTO chat_conversation
       (entity_type, leads_id, job_id, company_id, builder_id, created_at, updated_at)
     VALUES (:entityType, :leadsId, :jobId, :companyId, :builderId, NOW(), NOW())
     ON CONFLICT ${conflictTarget} DO NOTHING`,
    {
      replacements: {
        entityType: byLead ? CHAT_ENTITY.LEAD : CHAT_ENTITY.JOB,
        leadsId: access.leadsId,
        jobId: byLead ? null : access.jobId,
        companyId: access.companyId,
        builderId: access.builderId,
      },
      type: QueryTypes.INSERT,
      transaction,
    },
  );

  const conversation = await findConversation(access, transaction);
  if (!conversation) {
    throw { status: 500, message: "Could not open the conversation." };
  }
  return conversation;
}

/**
 * Move a user's read watermark forward (never back). `readAtSql` is a SQL
 * expression — a bound timestamp or a subquery over the thread's messages.
 */
async function advanceWatermark(conversationId, user, readAtSql, replacements, transaction = null) {
  await db.sequelize.query(
    `INSERT INTO chat_participant
       (chat_conversation_id, user_id, participant_type, last_read_at, created_at, updated_at)
     VALUES (:conversationId, :userId, :participantType, ${readAtSql}, NOW(), NOW())
     ON CONFLICT (chat_conversation_id, user_id) DO UPDATE SET
       last_read_at = GREATEST(chat_participant.last_read_at, EXCLUDED.last_read_at),
       participant_type = EXCLUDED.participant_type,
       updated_at = NOW()`,
    {
      replacements: {
        conversationId,
        userId: userIdOf(user),
        participantType: participantTypeOf(user),
        ...replacements,
      },
      type: QueryTypes.INSERT,
      transaction,
    },
  );
}

async function countUnread(conversationId, userId) {
  const [row] = await db.sequelize.query(
    `SELECT COUNT(*)::int AS unread
       FROM chat_message m
       LEFT JOIN chat_participant p
         ON p.chat_conversation_id = m.chat_conversation_id AND p.user_id = :userId
      WHERE m.chat_conversation_id = :conversationId
        AND m.sender_id IS DISTINCT FROM :userId
        AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)`,
    { replacements: { conversationId, userId }, type: QueryTypes.SELECT },
  );
  return row?.unread || 0;
}

/**
 * Latest watermark on each side of the thread — what the client needs to show
 * "Seen" on a message: a staff message is seen once any contact has read past
 * it, a contact's message once anyone on the builder side has.
 */
async function readReceipts(conversationId) {
  const rows = await db.sequelize.query(
    `SELECT participant_type, MAX(last_read_at) AS last_read_at
       FROM chat_participant
      WHERE chat_conversation_id = :conversationId
      GROUP BY participant_type`,
    { replacements: { conversationId }, type: QueryTypes.SELECT },
  );
  const byType = Object.fromEntries(rows.map((r) => [r.participant_type, r.last_read_at]));
  return {
    contact_last_read_at: byType[PARTICIPANT_TYPE.CONTACT] || null,
    staff_last_read_at: byType[PARTICIPANT_TYPE.STAFF] || null,
  };
}

/** The customer-side people on this lead/job, and whether they can sign in to read replies. */
export async function entityContacts(access) {
  const ids = new Set();
  if (access.leadsId) {
    const maps = await db.LeadsContactMap.findAll({
      where: { leads_id: access.leadsId },
      attributes: ["contact_id"],
    });
    maps.forEach((m) => m.contact_id && ids.add(m.contact_id));
  }
  if (access.customerContactId) {
    ids.add(access.customerContactId);
  }
  if (!ids.size) {
    return [];
  }

  const users = await db.Users.findAll({
    where: { users_id: { [Op.in]: [...ids] }, is_deleted: false },
    attributes: ["users_id", "name", "email", "has_login", "is_active"],
    order: [["name", "ASC"]],
  });
  return users.map((u) => ({
    user_id: u.users_id,
    name: u.name,
    email: u.email,
    has_portal_access: u.has_login !== false && u.is_active !== false,
  }));
}

/**
 * Presigned URLs for a message's files. `url` opens inline (image previews,
 * PDFs in a new tab); `download_url` saves under the original name.
 */
async function serializeAttachments(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) {
    return [];
  }
  return Promise.all(
    attachments.map(async (a) => {
      const [inline, download] = await Promise.all([
        generatePresignedDownloadUrl(a.key, ATTACHMENT_URL_TTL),
        generatePresignedDownloadUrl(a.key, ATTACHMENT_URL_TTL, a.name),
      ]);
      return {
        name: a.name,
        mime_type: a.mime_type,
        size: a.size,
        url: inline.success ? inline.url : null,
        download_url: download.success ? download.url : null,
      };
    }),
  );
}

async function serializeMessage(message, viewerId) {
  const plain = message.get ? message.get({ plain: true }) : message;
  return {
    chat_message_id: plain.chat_message_id,
    body: plain.body,
    attachments: await serializeAttachments(plain.attachments),
    created_at: plain.createdAt || plain.created_at,
    sender_id: plain.sender_id,
    sender_name: plain.sender?.name || "Former user",
    sender_photo: plain.sender?.photo || null,
    sender_role: plain.sender_role,
    sender_type: plain.sender_type,
    is_mine: !!viewerId && plain.sender_id === viewerId,
  };
}

function serializeAccess(access, user) {
  return {
    entity_type: access.entityType,
    leads_id: access.leadsId,
    job_id: access.jobId,
    reference_number: access.referenceNumber,
    customer_name: access.customerName,
    is_read_only: access.isSampleData,
    viewer_type: participantTypeOf(user),
  };
}

// ─── Public service API ──────────────────────────────────────────────────────

/**
 * GET /chat/:entity_type/:entity_id/messages
 *
 * Without cursors: the latest page. `before` pages back through history;
 * `after` is the catch-up cursor used after a socket reconnect and is inclusive — the client drops ids it
 * already has — so two messages sharing a timestamp are never skipped.
 */
export async function getMessages(entityType, entityId, query, user) {
  const access = await resolveChatAccess(entityType, entityId, user);
  const viewerId = userIdOf(user);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE));

  const [contacts, conversation] = await Promise.all([entityContacts(access), findConversation(access)]);
  const base = { entity: serializeAccess(access, user), contacts };

  if (!conversation) {
    return {
      ...base,
      conversation_id: null,
      messages: [],
      has_more: false,
      unread_count: 0,
      read_receipts: { contact_last_read_at: null, staff_last_read_at: null },
    };
  }

  const where = { chat_conversation_id: conversation.chat_conversation_id };
  const include = [{ model: db.Users, as: "sender", attributes: ["users_id", "name", "photo"] }];

  let messages;
  let hasMore = false;
  if (query.after) {
    where.created_at = { [Op.gte]: new Date(query.after) };
    messages = await db.ChatMessage.findAll({ where, include, order: [["created_at", "ASC"]], limit });
  } else {
    if (query.before) {
      where.created_at = { [Op.lt]: new Date(query.before) };
    }
    const rows = await db.ChatMessage.findAll({
      where,
      include,
      order: [["created_at", "DESC"]],
      limit: limit + 1,
    });
    hasMore = rows.length > limit;
    messages = rows.slice(0, limit).reverse();
  }

  const [unreadCount, receipts] = await Promise.all([
    countUnread(conversation.chat_conversation_id, viewerId),
    readReceipts(conversation.chat_conversation_id),
  ]);

  return {
    ...base,
    conversation_id: conversation.chat_conversation_id,
    messages: await Promise.all(messages.map((m) => serializeMessage(m, viewerId))),
    has_more: hasMore,
    unread_count: unreadCount,
    read_receipts: receipts,
  };
}

/**
 * Everything that must hold before anything is written for a send — including
 * before an attachment reaches S3, which is why the route runs it ahead of the
 * upload (see chat.routes.js).
 */
export async function resolveSendAccess(entityType, entityId, user) {
  const access = await resolveChatAccess(entityType, entityId, user);

  // A demo record is view-only everywhere else, and a message is a write.
  if (access.isSampleData) {
    throw sampleDataReadOnlyError(entityType === CHAT_ENTITY.LEAD ? "lead" : "job", "messaged");
  }
  return access;
}

/** Remove a request's chat uploads from S3 — for a send refused before sendMessage runs. */
export function discardChatUploads(files = []) {
  return Promise.all(files.map((f) => deleteFromS3(f.key)));
}

/**
 * Files picked from S Drive, checked and copied into chat storage.
 *
 * Each one must be a file the sender may open in S Drive (the same resolver the
 * drive's own download route uses, so an id lifted from elsewhere is refused)
 * and must pass the rules an uploaded attachment does. All are checked before
 * any is copied.
 *
 * Copied rather than referenced: the message owns its own object, so deleting,
 * replacing or trashing the drive file never breaks the chat, and a failed send
 * can delete what it stored without touching the drive. Each copy is pushed to
 * `stored` as soon as it exists, so the caller can clean up after a partial run.
 */
async function copyDriveFilesForChat(driveFileIds, user, stored) {
  if (!driveFileIds.length) {
    return;
  }
  if (participantTypeOf(user) !== PARTICIPANT_TYPE.STAFF) {
    throw { status: 403, message: "Only the builder's team can attach files from S Drive." };
  }

  const userId = userIdOf(user);
  const companyId = user?.company_id;
  const unavailable = { status: 404, message: "An S Drive file could not be found or you do not have access to it." };

  const driveFiles = [];
  for (const fileId of driveFileIds) {
    const permission = await resolveDrivePermission(userId, companyId, "FILE", fileId, user);
    if ((PERMISSION_RANK[permission] || 0) < PERMISSION_RANK.VIEW) {
      throw unavailable;
    }
    // Default (paranoid) find: a file in Trash is not offered for sending.
    const file = await db.sequelize.models.DriveFile.findOne({
      where: { file_id: fileId, ...(companyId ? { company_id: companyId } : {}) },
      attributes: ["file_id", "s3_key", "original_name", "file_name", "mime_type", "size"],
    });
    if (!file?.s3_key) {
      throw unavailable;
    }

    const name = file.original_name || file.file_name;
    if (!isSendableDriveFile(name, file.mime_type)) {
      throw { status: 422, message: `${name} cannot be sent in chat — only PDF, Word, Excel and image files.` };
    }
    if (Number(file.size) > MAX_DRIVE_ATTACHMENT_BYTES) {
      throw { status: 422, message: `${name} is larger than 50MB and cannot be attached.` };
    }
    driveFiles.push({ file, name });
  }

  for (const { file, name } of driveFiles) {
    const key = `${CHAT_ATTACHMENT_PREFIX}/${Date.now()}-${Math.round(Math.random() * 1e9)}-${name.replace(/[^\w.-]+/g, "_")}`;
    if (!(await copyS3Object(file.s3_key, key))) {
      throw { status: 502, message: `Could not attach ${name}. Please try again.` };
    }
    stored.push({ key, originalname: name, mimetype: file.mime_type, size: Number(file.size) || 0 });
  }
}

/**
 * POST /chat/:entity_type/:entity_id/messages
 *
 * `files` are multer-s3 uploads, already in S3; `driveFileIds` are S Drive files
 * to attach, copied in here. If the message is refused or fails to save every
 * stored object is removed again, so a failed send leaves nothing behind.
 * `access` may be passed in when the route has already resolved it.
 */
export async function sendMessage(
  entityType,
  entityId,
  body,
  user,
  files = [],
  preResolvedAccess = null,
  driveFileIds = [],
) {
  // Everything this send has put in S3 — uploads plus drive copies.
  const stored = [...files];
  const discardUploads = () => discardChatUploads(stored);

  let access;
  try {
    access = preResolvedAccess || (await resolveSendAccess(entityType, entityId, user));

    const text = String(body ?? "").trim();
    if (!text && !files.length && !driveFileIds.length) {
      throw { status: 422, message: "Message cannot be empty." };
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw { status: 422, message: `Message must be at most ${MAX_MESSAGE_LENGTH} characters.` };
    }
    if (files.length + driveFileIds.length > MAX_ATTACHMENTS) {
      throw { status: 422, message: `You can attach at most ${MAX_ATTACHMENTS} files per message.` };
    }
    body = text;

    await copyDriveFilesForChat(driveFileIds, user, stored);
  } catch (error) {
    await discardUploads();
    throw error;
  }

  const attachments = stored.map((f) => ({
    key: f.key,
    name: f.originalname,
    mime_type: f.mimetype || f.contentType || "application/octet-stream",
    size: f.size,
  }));

  const viewerId = userIdOf(user);
  let conversation;
  let message;
  const transaction = await db.sequelize.transaction();
  try {
    conversation = await getOrCreateConversation(access, transaction);

    message = await db.ChatMessage.create(
      {
        chat_conversation_id: conversation.chat_conversation_id,
        sender_id: viewerId,
        sender_role: user.role_name || null,
        sender_type: participantTypeOf(user),
        body,
        attachments,
      },
      { transaction },
    );

    await conversation.update({ last_message_at: message.createdAt }, { transaction });

    // Having written it, the sender has read everything up to it.
    await advanceWatermark(
      conversation.chat_conversation_id,
      user,
      ":readAt",
      { readAt: message.createdAt },
      transaction,
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    await discardUploads();
    throw error;
  }

  // The auth user may not carry the photo; everyone else in the room shows it.
  const senderPhoto =
    user.photo ??
    (await db.Users.findByPk(viewerId, { attributes: ["photo"], raw: true }))?.photo ??
    null;
  const serialized = await serializeMessage(
    { ...message.get({ plain: true }), sender: { name: user.name || "You", photo: senderPhoto } },
    viewerId,
  );

  // Pushed to everyone in the thread's room; `is_mine` is per viewer, so the
  // client works it out from sender_id.
  const broadcast = { ...serialized };
  delete broadcast.is_mine;
  publishChatEvent(CHAT_EVENT.MESSAGE, {
    access,
    conversationId: conversation.chat_conversation_id,
    message: broadcast,
  });
  publishChatEvent(CHAT_EVENT.READ, {
    access,
    conversationId: conversation.chat_conversation_id,
    userId: viewerId,
    participantType: participantTypeOf(user),
    lastReadAt: message.createdAt,
  });

  return serialized;
}

/** POST /chat/:entity_type/:entity_id/read — everything in the thread so far is read. */
export async function markRead(entityType, entityId, user) {
  const access = await resolveChatAccess(entityType, entityId, user);
  const conversation = await findConversation(access);
  if (!conversation) {
    return { unread_count: 0 };
  }

  await advanceWatermark(
    conversation.chat_conversation_id,
    user,
    "(SELECT MAX(created_at) FROM chat_message WHERE chat_conversation_id = :conversationId)",
    {},
  );

  const [participant] = await db.sequelize.query(
    `SELECT last_read_at FROM chat_participant
      WHERE chat_conversation_id = :conversationId AND user_id = :userId`,
    {
      replacements: { conversationId: conversation.chat_conversation_id, userId: userIdOf(user) },
      type: QueryTypes.SELECT,
    },
  );
  // Lets the other side flip "Sent" to "Seen" without asking.
  if (participant?.last_read_at) {
    publishChatEvent(CHAT_EVENT.READ, {
      access,
      conversationId: conversation.chat_conversation_id,
      userId: userIdOf(user),
      participantType: participantTypeOf(user),
      lastReadAt: participant.last_read_at,
    });
  }

  return { unread_count: await countUnread(conversation.chat_conversation_id, userIdOf(user)) };
}

/** GET /chat/:entity_type/:entity_id/unread — the tab badge before live updates take over. */
export async function getUnreadCount(entityType, entityId, user) {
  const access = await resolveChatAccess(entityType, entityId, user);
  const conversation = await findConversation(access);
  if (!conversation) {
    return { unread_count: 0 };
  }
  return { unread_count: await countUnread(conversation.chat_conversation_id, userIdOf(user)) };
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

const UNREAD_SQL = `(SELECT COUNT(*)::int FROM chat_message um
     WHERE um.chat_conversation_id = c.chat_conversation_id
       AND um.sender_id IS DISTINCT FROM :userId
       AND (p.last_read_at IS NULL OR um.created_at > p.last_read_at))`;

const LAST_MESSAGE_JOINS = `
  LEFT JOIN chat_participant p
    ON p.chat_conversation_id = c.chat_conversation_id AND p.user_id = :userId
  LEFT JOIN LATERAL (
    SELECT lm.sender_id, lm.sender_type,
           -- An attachments-only message previews as its file(s) in the inbox.
           COALESCE(NULLIF(lm.body, ''),
             CASE WHEN jsonb_array_length(lm.attachments) = 1
                  THEN '📎 ' || (lm.attachments->0->>'name')
                  ELSE '📎 ' || jsonb_array_length(lm.attachments) || ' attachments'
             END) AS body
      FROM chat_message lm
     WHERE lm.chat_conversation_id = c.chat_conversation_id
     ORDER BY lm.created_at DESC
     LIMIT 1
  ) last_msg ON TRUE
  LEFT JOIN users last_sender ON last_sender.users_id = last_msg.sender_id`;

const and = (parts) => (parts.length ? parts.map((p) => `(${p})`).join(" AND ") : "TRUE");

/**
 * The SQL twin of resolveChatAccess for staff: whether the caller may open the
 * lead (`leadSql`, over `l`) and the job (`jobSql`, over `j` and its lead `l`)
 * a thread belongs to. A build's thread is visible through either record.
 */
async function staffInboxScope(user) {
  const roleName = user?.role_name;
  const scope = getRoleScope(roleName);
  if (!scope || roleName === ROLES.CONTACT) {
    return { leadSql: "FALSE", jobSql: "FALSE", replacements: {} };
  }

  const [canLead, canJob] = await Promise.all([
    resolvePermission(user, MODULES.LEAD, ACTIONS.READ),
    resolvePermission(user, MODULES.JOB, ACTIONS.READ),
  ]);

  const lead = [canLead ? "TRUE" : "FALSE"];
  const job = [canJob ? "TRUE" : "FALSE"];

  if (scope !== SCOPES.PLATFORM) {
    const leadTenant = [];
    if (user.builder_id) {
      leadTenant.push("l.builder_id = :builderId");
    }
    if (user.company_id) {
      leadTenant.push("l.company_id = :companyId");
    }
    lead.push(leadTenant.length ? leadTenant.join(" OR ") : "FALSE");

    if (scope === SCOPES.COMPANY) {
      job.push(user.company_id ? "j.company_id = :companyId" : "FALSE");
    } else {
      job.push(user.builder_id ? "j.builder_id = :builderId" : "FALSE");
    }
  }

  const assigned = `EXISTS (SELECT 1 FROM job_role_assignment ra
                     WHERE ra.job_id = j.job_id AND ra.user_id = :userId)`;
  switch (scope) {
  case SCOPES.ASSIGNED:
    lead.push("l.assignee_id = :userId");
    job.push("l.assignee_id = :userId");
    break;
  case SCOPES.SELF:
    lead.push("l.created_by = :userId");
    job.push("l.created_by = :userId");
    break;
  case SCOPES.SITE_ASSIGNED:
    lead.push("FALSE");
    job.push(`j.supervisor_id = :userId OR ${assigned}`);
    break;
  case SCOPES.JOB_ASSIGNED:
    lead.push("FALSE");
    job.push(assigned);
    break;
  case SCOPES.JOB_ONLY:
    lead.push("FALSE");
    job.push("FALSE");
    break;
  default:
    break;
  }

  const leadSample = sampleDataSqlScope("l");
  const jobSample = sampleDataSqlScope("j");
  if (leadSample.sql) {
    lead.push(leadSample.sql);
  }
  if (jobSample.sql) {
    job.push(jobSample.sql);
  }

  return {
    leadSql: `l.leads_id IS NOT NULL AND ${and(lead)}`,
    jobSql: `j.job_id IS NOT NULL AND ${and(job)}`,
    replacements: {
      builderId: user.builder_id || null,
      companyId: user.company_id || null,
      ...leadSample.replacements,
      ...jobSample.replacements,
    },
  };
}

/**
 * GET /chat/conversations
 *
 *  - Staff: every thread they may reach that has at least one message,
 *    latest activity first.
 *  - Contact: every lead and job they are linked to — with or without a thread
 *    yet, so the customer can start the conversation from their inbox.
 */
export async function listConversations(query, user) {
  const userId = userIdOf(user);
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const search = query.search ? `%${String(query.search).trim()}%` : null;

  let sql;
  let replacements = { userId, limit, offset, search };

  if (user?.role_name === ROLES.CONTACT) {
    const tenantLead = [];
    const tenantJob = [];
    if (user.builder_id) {
      tenantLead.push("l.builder_id = :builderId");
      tenantJob.push("j.builder_id = :builderId");
    }
    if (user.company_id) {
      tenantLead.push("l.company_id = :companyId");
      tenantJob.push("j.company_id = :companyId");
    }
    const leadSample = sampleDataSqlScope("l");
    const jobSample = sampleDataSqlScope("j");
    replacements = {
      ...replacements,
      builderId: user.builder_id || null,
      companyId: user.company_id || null,
      ...leadSample.replacements,
      ...jobSample.replacements,
    };

    sql = `
      WITH targets AS (
        SELECT 'LEAD'::text AS entity_type, l.leads_id, NULL::uuid AS job_id,
               l.reference_number, l.name AS customer_name, l.created_at AS entity_created_at,
               COALESCE(lb.name, lco.name) AS builder_name,
               COALESCE(NULLIF(lb.logo, ''), NULLIF(lco.company_logo, '')) AS builder_logo
          FROM leads l
          LEFT JOIN builder lb ON lb.builder_id = l.builder_id
          LEFT JOIN company lco ON lco.company_id = l.company_id
         WHERE EXISTS (SELECT 1 FROM leads_contact_map lcm
                        WHERE lcm.leads_id = l.leads_id AND lcm.contact_id = :userId)
           -- An enquiry that became a job is listed once, as the job (the job
           -- row below reaches the contact through this same lead link).
           AND NOT EXISTS (SELECT 1 FROM job lj
                             JOIN opportunity lo ON lo.opportunity_id = lj.opportunity_id
                            WHERE lo.leads_id = l.leads_id)
           AND ${and([tenantLead.length ? tenantLead.join(" OR ") : "FALSE", leadSample.sql || "TRUE"])}
        UNION ALL
        SELECT 'JOB'::text, o.leads_id, j.job_id,
               j.reference_number, jl.name, j.created_at,
               COALESCE(jb.name, jco.name),
               COALESCE(NULLIF(jb.logo, ''), NULLIF(jco.company_logo, ''))
          FROM job j
          LEFT JOIN opportunity o ON o.opportunity_id = j.opportunity_id
          LEFT JOIN leads jl ON jl.leads_id = o.leads_id
          LEFT JOIN builder jb ON jb.builder_id = j.builder_id
          LEFT JOIN company jco ON jco.company_id = j.company_id
         WHERE (j.customer_contact_id = :userId
                OR EXISTS (SELECT 1 FROM leads_contact_map lcm
                            WHERE lcm.leads_id = o.leads_id AND lcm.contact_id = :userId))
           AND ${and([tenantJob.length ? tenantJob.join(" OR ") : "FALSE", jobSample.sql || "TRUE"])}
      ),
      visible AS (
        SELECT t.entity_type, t.leads_id, t.job_id, t.reference_number, t.customer_name,
               t.builder_name, t.builder_logo, t.entity_created_at, c.chat_conversation_id, c.last_message_at,
               last_msg.body AS last_message_body,
               last_msg.sender_type AS last_message_sender_type,
               last_sender.name AS last_message_sender_name,
               CASE WHEN c.chat_conversation_id IS NULL THEN 0 ELSE ${UNREAD_SQL} END AS unread_count
          FROM targets t
          -- The build's one thread: the lead's when there is a lead, else the job's own.
          LEFT JOIN chat_conversation c
            ON (t.leads_id IS NOT NULL AND c.entity_type = 'LEAD' AND c.leads_id = t.leads_id)
            OR (t.leads_id IS NULL AND c.entity_type = 'JOB' AND c.job_id = t.job_id)
          ${LAST_MESSAGE_JOINS}
         WHERE (:search::text IS NULL OR t.reference_number ILIKE :search OR t.customer_name ILIKE :search
                OR t.builder_name ILIKE :search)
      )
      SELECT *, COUNT(*) OVER()::int AS total_records, SUM(unread_count) OVER()::int AS total_unread
        FROM visible
       ORDER BY last_message_at DESC NULLS LAST, entity_created_at DESC
       LIMIT :limit OFFSET :offset`;
  } else {
    const scope = await staffInboxScope(user);
    replacements = { ...replacements, ...scope.replacements };

    // One row per build. `j` is the thread's job: its own for a JOB thread, or
    // the job the lead became for a LEAD thread. Once there is a job the caller
    // may open, the row opens as that job; otherwise as the lead.
    sql = `
      WITH threads AS (
        SELECT c.leads_id, j.job_id AS build_job_id,
               j.reference_number AS job_reference, l.reference_number AS lead_reference,
               l.name AS customer_name,
               -- The job's customer, else a contact linked to the lead, with a photo.
               COALESCE(
                 (SELECT NULLIF(cu.photo, '') FROM users cu WHERE cu.users_id = j.customer_contact_id),
                 (SELECT cu.photo FROM leads_contact_map lcm
                    JOIN users cu ON cu.users_id = lcm.contact_id
                   WHERE lcm.leads_id = c.leads_id AND COALESCE(cu.photo, '') <> ''
                   ORDER BY cu.name LIMIT 1)
               ) AS customer_photo,
               c.chat_conversation_id, c.last_message_at,
               last_msg.body AS last_message_body,
               last_msg.sender_type AS last_message_sender_type,
               last_sender.name AS last_message_sender_name,
               ${UNREAD_SQL} AS unread_count,
               COALESCE(${scope.jobSql}, FALSE) AS job_ok,
               COALESCE(${scope.leadSql}, FALSE) AS lead_ok
          FROM chat_conversation c
          LEFT JOIN leads l ON l.leads_id = c.leads_id
          LEFT JOIN LATERAL (
            SELECT jj.* FROM job jj
              LEFT JOIN opportunity oo ON oo.opportunity_id = jj.opportunity_id
             WHERE jj.job_id = c.job_id
                OR (c.job_id IS NULL AND oo.leads_id = c.leads_id)
             ORDER BY jj.created_at DESC
             LIMIT 1
          ) j ON TRUE
          ${LAST_MESSAGE_JOINS}
         WHERE c.last_message_at IS NOT NULL
      ),
      visible AS (
        SELECT CASE WHEN job_ok THEN 'JOB' ELSE 'LEAD' END AS entity_type,
               leads_id,
               CASE WHEN job_ok THEN build_job_id END AS job_id,
               CASE WHEN job_ok THEN job_reference ELSE lead_reference END AS reference_number,
               customer_name, customer_photo, chat_conversation_id, last_message_at,
               last_message_body, last_message_sender_type, last_message_sender_name, unread_count
          FROM threads
         WHERE (job_ok OR lead_ok)
           AND (:search::text IS NULL
                OR job_reference ILIKE :search
                OR lead_reference ILIKE :search
                OR customer_name ILIKE :search)
      )
      SELECT *, COUNT(*) OVER()::int AS total_records, SUM(unread_count) OVER()::int AS total_unread
        FROM visible
       ORDER BY last_message_at DESC
       LIMIT :limit OFFSET :offset`;
  }

  const rows = await db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

  const totalRecords = rows[0]?.total_records || 0;
  const totalUnread = rows[0]?.total_unread || 0;

  return {
    conversations: rows.map(({ total_records: _t, total_unread: _u, entity_created_at: _c, ...row }) => row),
    total_unread: totalUnread,
    pagination: {
      total_records: totalRecords,
      total_pages: Math.ceil(totalRecords / limit),
      current_page: page,
      limit,
    },
  };
}

export default {
  resolveChatAccess,
  resolveSendAccess,
  getMessages,
  sendMessage,
  discardChatUploads,
  markRead,
  getUnreadCount,
  listConversations,
};
