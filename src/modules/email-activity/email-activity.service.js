import db from "../../config/database/models/postgre-models/index.js";
import { Op, Sequelize } from "sequelize";
import { ROLES } from "../../constants/rbac.js";

// Roles that can see all email activity within their company/builder scope.
const COMPANY_ADMIN_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.COMPANY_ADMINISTRATOR,
  ROLES.MH_COMPANY_ADMIN,
  ROLES.MY_HOME_COMPANY_ADMIN,
  ROLES.MY_HOME_ADMIN,
]);

function isCompanyAdmin(user) {
  return COMPANY_ADMIN_ROLES.has(user?.role_name);
}

/**
 * Build a scope filter that limits notifications to those sent by users
 * within the same builder/company as the logged-in user, plus system emails
 * (sender_id IS NULL).
 */
function buildSenderScope(user) {
  const builderId = user?.builder_id || null;
  const companyId = user?.company_id || null;

  // Match users belonging to the same builder or company
  const userWhere = { [Op.or]: [] };
  if (builderId) userWhere[Op.or].push({ builder_id: builderId });
  if (companyId) userWhere[Op.or].push({ company_id: companyId });

  // If the user has no builder_id and no company_id, return empty scope
  if (userWhere[Op.or].length === 0) return null;

  return userWhere;
}

/**
 * Get all user IDs that belong to the same builder/company as the logged-in user.
 * Used to scope notifications by sender_id.
 */
async function getOrgUserIds(user) {
  const userWhere = buildSenderScope(user);
  if (!userWhere) return [];

  const orgUsers = await db.Users.findAll({
    where: userWhere,
    attributes: ["users_id"],
    raw: true,
  });

  return orgUsers.map((u) => u.users_id);
}

/**
 * Pull a lead id out of a notification's metadata. Different senders store it
 * under different keys (appointment worker uses `leadsId`, docusign uses
 * `leadId`, etc.), so accept the common variants.
 */
function extractLeadId(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  return (
    metadata.leadsId ||
    metadata.leadId ||
    metadata.leads_id ||
    metadata.lead_id ||
    null
  );
}

/**
 * Fetch lead details for the given lead ids, scoped to the user's builder/company,
 * and return a map keyed by leads_id for quick lookup.
 */
async function getLeadMap(user, leadIds) {
  const uniqueIds = [...new Set(leadIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const where = { leads_id: { [Op.in]: uniqueIds } };
  const builderId = user?.builder_id || null;
  const companyId = user?.company_id || null;
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const leads = await db.Leads.findAll({
    where,
    attributes: ["leads_id", "reference_number", "name", "email", "phone"],
    raw: true,
  });

  return leads.reduce((acc, lead) => {
    acc[lead.leads_id] = lead;
    return acc;
  }, {});
}

/**
 * List email activities with search, filter, and pagination.
 *
 * Scope: only notifications whose sender belongs to the same builder/company
 * as the requesting user, plus system emails (sender_id IS NULL).
 */
export async function getEmailActivitiesService(user, filters) {
  const { page = 1, limit = 20, search, delivery_status, notification_type = "EMAIL" } = filters;
  const offset = (page - 1) * limit;

  const alWhere = { module: 'Email' };

  // Tenant isolation: always scope by builder or company on the log record itself.
  // This prevents system-sent emails (user_id IS NULL) from leaking across tenants.
  if (user?.builder_id) {
    alWhere.builder_id = user.builder_id;
  } else if (user?.company_id) {
    alWhere.company_id = user.company_id;
  }

  // Role-based visibility:
  // Company Admin / Super Admin → all emails in their scope (including system-sent).
  // Builder                    → their own emails + system-sent (user_id=null) within their builder scope.
  // All other roles            → strictly only emails they personally sent.
  if (isCompanyAdmin(user)) {
    const orgUserIds = await getOrgUserIds(user);
    if (orgUserIds.length > 0) {
      alWhere[Op.or] = [
        { user_id: { [Op.in]: orgUserIds } },
        { user_id: null },
      ];
    } else {
      alWhere.user_id = null;
    }
  } else if (user?.role_name === ROLES.BUILDER) {
    alWhere[Op.or] = [
      { user_id: user.users_id },
      { user_id: null },
    ];
  } else {
    alWhere.user_id = user.users_id;
  }

  const notificationWhere = {};

  // Filter by notification type (default: EMAIL)
  if (notification_type) {
    notificationWhere.notification_type = notification_type;
  }

  // Filter by delivery status
  if (delivery_status) {
    notificationWhere.delivery_status = delivery_status;
  }

  // Search across title, body, and receiver_info
  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`;
    notificationWhere[Op.or] = [
      { title: { [Op.iLike]: searchTerm } },
      { body: { [Op.iLike]: searchTerm } },
      { receiver_info: { [Op.iLike]: searchTerm } },
    ];
  }

  const { count: totalRecords, rows } = await db.ActivityLog.findAndCountAll({
    where: alWhere,
    include: [
      {
        model: db.Notifications,
        as: "notification",
        where: Object.keys(notificationWhere).length ? notificationWhere : undefined,
        required: true,
        include: [
          {
            model: db.Users,
            as: "sender",
            attributes: ["users_id", "name", "email"],
            required: false,
          },
          {
            model: db.NotificationTemplate,
            as: "template",
            attributes: ["notification_template_id", "template_type", "title"],
            required: false,
          },
        ],
      },
    ],
    order: [["created_at", "DESC"]],
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
  });

  const totalPages = Math.ceil(totalRecords / limit);

  // First pass: flatten rows and parse JSON columns.
  const parsedRows = rows.map((row) => {
    const activityPlain = row.get({ plain: true });
    const plain = activityPlain.notification || {};

    // Parse receiver_info JSON safely
    let receiverInfo = plain.receiver_info;
    try {
      receiverInfo = JSON.parse(plain.receiver_info);
    } catch {
      // keep as-is if not valid JSON
    }

    // Parse metadata_json safely
    let metadataJson = plain.metadata_json;
    try {
      metadataJson = JSON.parse(plain.metadata_json);
    } catch {
      // keep as-is if not valid JSON
    }

    return { plain, receiverInfo, metadataJson };
  });

  // Resolve any lead referenced in metadata in a single batched query.
  const leadMap = await getLeadMap(
    user,
    parsedRows.map(({ metadataJson }) => extractLeadId(metadataJson))
  );

  const emailActivities = parsedRows.map(({ plain, receiverInfo, metadataJson }) => {
    const leadId = extractLeadId(metadataJson);
    const lead = leadId ? leadMap[leadId] || null : null;

    return {
      notifications_id: plain.notifications_id,
      sender_id: plain.sender_id,
      sender_name: plain.sender?.name || null,
      sender_email: plain.sender?.email || null,
      receiver_info: receiverInfo,
      notification_type: plain.notification_type,
      template_type: plain.template?.template_type || null,
      title: plain.title,
      body: plain.body,
      metadata_json: metadataJson,
      // Lead the email is associated with, if any (null when not lead-linked).
      lead: lead
        ? {
            leads_id: lead.leads_id,
            reference_number: lead.reference_number,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
          }
        : null,
      delivery_status: plain.delivery_status,
      failure_reason: plain.failure_reason,
      created_at: plain.created_at,
      updated_at: plain.updated_at,
    };
  });

  const stats = await getEmailActivityStatsService(user, { notification_type });

  return {
    emailActivities,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalRecords,
      totalPages,
    },
    stats,
  };
}

/**
 * Get email activity stats: counts by delivery_status.
 * Scoped to the logged-in user's builder/company.
 */
export async function getEmailActivityStatsService(user, filters = {}) {
  const { notification_type = "EMAIL" } = filters;

  const alWhere = { module: 'Email' };

  // Tenant isolation: always scope by builder or company on the log record itself.
  if (user?.builder_id) {
    alWhere.builder_id = user.builder_id;
  } else if (user?.company_id) {
    alWhere.company_id = user.company_id;
  }

  // Role-based visibility (mirrors getEmailActivitiesService).
  if (isCompanyAdmin(user)) {
    const orgUserIds = await getOrgUserIds(user);
    if (orgUserIds.length > 0) {
      alWhere[Op.or] = [
        { user_id: { [Op.in]: orgUserIds } },
        { user_id: null },
      ];
    } else {
      alWhere.user_id = null;
    }
  } else if (user?.role_name === ROLES.BUILDER) {
    alWhere[Op.or] = [
      { user_id: user.users_id },
      { user_id: null },
    ];
  } else {
    alWhere.user_id = user.users_id;
  }

  const notificationWhere = {};
  if (notification_type) {
    notificationWhere.notification_type = notification_type;
  }

  const countData = await db.ActivityLog.findOne({
    where: alWhere,
    include: [
      {
        model: db.Notifications,
        as: "notification",
        where: Object.keys(notificationWhere).length ? notificationWhere : undefined,
        required: true,
        attributes: []
      }
    ],
    attributes: [
      [Sequelize.fn("COUNT", Sequelize.col("ActivityLog.activity_log_id")), "total_count"],
      [
        Sequelize.literal("COUNT(CASE WHEN \"notification\".\"delivery_status\" = 'SENT' THEN 1 END)"),
        "sent_count",
      ],
      [
        Sequelize.literal("COUNT(CASE WHEN \"notification\".\"delivery_status\" = 'FAILED' THEN 1 END)"),
        "failed_count",
      ],
      [
        Sequelize.literal("COUNT(CASE WHEN \"notification\".\"delivery_status\" = 'PENDING' THEN 1 END)"),
        "pending_count",
      ],
    ],
    raw: true,
  });

  return {
    all: parseInt(countData?.total_count || 0, 10),
    sent: parseInt(countData?.sent_count || 0, 10),
    failed: parseInt(countData?.failed_count || 0, 10),
    pending: parseInt(countData?.pending_count || 0, 10),
  };
}

/**
 * Get a single email activity by its ID.
 * Scoped to the logged-in user's builder/company.
 */
export async function getEmailActivityByIdService(user, notificationsId) {
  // Tenant isolation: always scope by builder or company on the log record itself.
  const tenantScope = {};
  if (user?.builder_id) {
    tenantScope.builder_id = user.builder_id;
  } else if (user?.company_id) {
    tenantScope.company_id = user.company_id;
  }

  // Role-based visibility (mirrors getEmailActivitiesService).
  const senderScope = {};
  if (isCompanyAdmin(user)) {
    const orgUserIds = await getOrgUserIds(user);
    if (orgUserIds.length > 0) {
      senderScope[Op.or] = [
        { user_id: { [Op.in]: orgUserIds } },
        { user_id: null },
      ];
    } else {
      senderScope.user_id = null;
    }
  } else if (user?.role_name === ROLES.BUILDER) {
    senderScope[Op.or] = [
      { user_id: user.users_id },
      { user_id: null },
    ];
  } else {
    senderScope.user_id = user.users_id;
  }

  const record = await db.ActivityLog.findOne({
    where: {
      module_id: notificationsId,
      module: 'Email',
      ...tenantScope,
      ...senderScope,
    },
    include: [
      {
        model: db.Notifications,
        as: "notification",
        required: true,
        include: [
          {
            model: db.Users,
            as: "sender",
            attributes: ["users_id", "name", "email"],
            required: false,
          },
          {
            model: db.NotificationTemplate,
            as: "template",
            attributes: ["notification_template_id", "template_type", "title"],
            required: false,
          },
        ],
      }
    ],
  });

  if (!record) {
    const error = new Error("Email activity not found.");
    error.statusCode = 404;
    throw error;
  }

  const activityPlain = record.get({ plain: true });
  const plain = activityPlain.notification || {};

  // Parse receiver_info JSON safely
  let receiverInfo = plain.receiver_info;
  try {
    receiverInfo = JSON.parse(plain.receiver_info);
  } catch {
    // keep as-is
  }

  // Parse metadata_json safely
  let metadataJson = plain.metadata_json;
  try {
    metadataJson = JSON.parse(plain.metadata_json);
  } catch {
    // keep as-is
  }

  // Resolve the associated lead, if the email is lead-linked.
  const leadId = extractLeadId(metadataJson);
  const leadMap = leadId ? await getLeadMap(user, [leadId]) : {};
  const lead = leadId ? leadMap[leadId] || null : null;

  return {
    notifications_id: plain.notifications_id,
    sender_id: plain.sender_id,
    sender_name: plain.sender?.name || null,
    sender_email: plain.sender?.email || null,
    receiver_info: receiverInfo,
    notification_type: plain.notification_type,
    template_type: plain.template?.template_type || null,
    template_title: plain.template?.title || null,
    title: plain.title,
    body: plain.body,
    metadata_json: metadataJson,
    lead: lead
      ? {
          leads_id: lead.leads_id,
          reference_number: lead.reference_number,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
        }
      : null,
    delivery_status: plain.delivery_status,
    failure_reason: plain.failure_reason,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
  };
}
