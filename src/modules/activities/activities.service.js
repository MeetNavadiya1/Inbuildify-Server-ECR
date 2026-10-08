import db from "../../config/database/models/postgre-models/index.js";
import { getManageableRoles, ROLES } from "../../constants/rbac.js";
import { keysToCamelCase, formatCamelCaseToReadable } from "../../utils/common.js";
import { sampleDataSqlScope } from "../../config/database/models/postgre-models/sampleDataFlag.js";

function resolveScope(currentUser) {
  const companyId = currentUser.role_name === ROLES.SUPER_ADMIN ? null : currentUser.company_id;
  const builderId = [ROLES.BUILDER, ROLES.SALES_MANAGER, ROLES.SALES_CONSULTANT].includes(currentUser.role_name)
    ? currentUser.builder_id
    : null;
  const userId = currentUser.users_id;
  return { companyId, builderId, userId };
}

async function buildActivityWhereClause(currentUser, filters) {
  const { companyId, builderId, userId } = resolveScope(currentUser);
  const { search, module: moduleFilter } = filters;

  const replacements = {};
  let whereClause = "1=1";

  // 1. Filter by company
  if (companyId) {
    whereClause += " AND al.company_id = :companyId";
    replacements.companyId = companyId;
  }

  // 2. Filter by builder or user
  if (builderId) {
    whereClause += " AND (al.builder_id = :builderId OR al.user_id = :userId)";
    replacements.builderId = builderId;
    replacements.userId = userId;
  }

  // 3. Hierarchy filter for actors
  if (currentUser.role_name !== ROLES.SUPER_ADMIN) {
    let allowedActorRoles = [...getManageableRoles(currentUser.role_name), currentUser.role_name];

    try {
      const { listCompanyRoles } = await import("../role/role.service.js");
      const visibleRoles = await listCompanyRoles(currentUser);
      visibleRoles.forEach(r => allowedActorRoles.push(r.name));
    } catch (e) {
      console.error("Error fetching visible custom roles for activities filter:", e);
    }

    allowedActorRoles = [...new Set(allowedActorRoles)];
    whereClause += " AND (al.user_id IS NULL OR r.name IN (:allowedActorRoles))";
    replacements.allowedActorRoles = allowedActorRoles;
  }

  if (moduleFilter) {
    whereClause += " AND al.module ILIKE :moduleFilter";
    replacements.moduleFilter = moduleFilter;
  }

  if (search) {
    whereClause += " AND (u.name ILIKE :search OR al.description ILIKE :search OR al.record_name ILIKE :search)";
    replacements.search = `%${search}%`;
  }

  // The seeded timeline is cloned per person along with the leads and jobs it
  // narrates, so without this the company's Activity screen replayed the same
  // demo history once per colleague who imported it.
  const sampleScope = sampleDataSqlScope("al");
  if (sampleScope.sql) {
    whereClause += ` AND ${sampleScope.sql}`;
    Object.assign(replacements, sampleScope.replacements);
  }

  return { whereClause, replacements };
}

function formatActivityLogs(logs) {
  const activityLogs = keysToCamelCase(logs);

  // Format readable fields similar to lead activities
  activityLogs.forEach(log => {
    if (log.userName) log.userName = formatCamelCaseToReadable(log.userName);
    if (log.recordName && !log.recordName.startsWith('QT')) {
      log.recordName = formatCamelCaseToReadable(log.recordName);
    }
    if (log.module) log.module = formatCamelCaseToReadable(log.module);
  });

  return activityLogs;
}

export async function getGlobalActivities(currentUser, filters) {
  const { page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const { whereClause, replacements } = await buildActivityWhereClause(currentUser, filters);
  replacements.limit = limit;
  replacements.offset = offset;

  const query = `
    SELECT al.*, u.name AS user_name
    FROM activity_logs al
    LEFT JOIN users u ON al.user_id = u.users_id
    LEFT JOIN role r ON u.role_id = r.role_id
    WHERE ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT :limit OFFSET :offset
  `;

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM activity_logs al
    LEFT JOIN users u ON al.user_id = u.users_id
    LEFT JOIN role r ON u.role_id = r.role_id
    WHERE ${whereClause}
  `;

  const logs = await db.sequelize.query(query, { replacements, type: db.sequelize.QueryTypes.SELECT });
  const countResult = await db.sequelize.query(countQuery, { replacements, type: db.sequelize.QueryTypes.SELECT });
  const total = countResult[0].total;

  const activityLogs = formatActivityLogs(logs);

  return {
    success: true,
    data: {
      activityLogs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    },
    message: "Global activity log fetched successfully"
  };
}

// Returns every activity in a single flat timeline — no pagination, no expand/compact.
export async function getActivitiesTimeline(currentUser, filters) {
  const { whereClause, replacements } = await buildActivityWhereClause(currentUser, filters);

  const query = `
    SELECT al.*, u.name AS user_name
    FROM activity_logs al
    LEFT JOIN users u ON al.user_id = u.users_id
    LEFT JOIN role r ON u.role_id = r.role_id
    WHERE ${whereClause}
    ORDER BY al.created_at DESC
  `;

  const logs = await db.sequelize.query(query, { replacements, type: db.sequelize.QueryTypes.SELECT });
  const activityLogs = formatActivityLogs(logs);

  return {
    success: true,
    data: {
      activityLogs,
      total: activityLogs.length
    },
    message: "Global activity timeline fetched successfully"
  };
}

export default {
  getGlobalActivities,
  getActivitiesTimeline
};
