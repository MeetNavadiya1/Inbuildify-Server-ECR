import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteCacheByPrefix, getCache, setCache } from "../../service/redisCache.service.js";
import db from "../../config/database/models/postgre-models/index.js";
import { sampleDataSqlScope } from "../../config/database/models/postgre-models/sampleDataFlag.js";

const WIDGET_CACHE_TTL_SECONDS = 3600;

/**
 * GET DASHBOARD DATA
 */
export async function getDashboardData(req, res) {
  try {
    const builderId = req.user.builder_id;
    if (!builderId) {
      return errorResponse(res, 400, "Builder ID not found.");
    }

    // The demo team and demo leads are cloned per person, so these tiles count
    // the caller's own — which also means the cached payload is theirs, not the
    // builder's. Keying it on the builder alone served one colleague's numbers
    // to the next.
    const sampleUsers = sampleDataSqlScope("users");
    const sampleLeads = sampleDataSqlScope("leads");
    const sampleLeadRows = sampleDataSqlScope("ld");
    const andWhen = (scope) => (scope.sql ? ` AND ${scope.sql}` : "");

    const cacheKey = `dashboard:data:builder:${builderId}:user:${req.user.users_id || "all"}`;
    const cachedPayload = await getCache(cacheKey);

    if (cachedPayload) {
      return successResponse(res, cachedPayload, "Dashboard data fetched successfully.");
    }

    const query = `
      SELECT
        (SELECT COUNT(*) FROM contractor WHERE builder_id = :builderId AND is_deleted = false) AS contractor_count,
        COALESCE(
          (SELECT json_agg(c) 
           FROM (
             SELECT contractor_id, name, email, created_at
             FROM contractor 
             WHERE builder_id = :builderId AND is_deleted = false
             ORDER BY created_at DESC
             LIMIT 3
           ) c
          ), '[]'
        ) AS contractor_data,
        (SELECT COUNT(*) FROM users WHERE builder_id = :builderId AND is_active = true${andWhen(sampleUsers)}) AS users_count,
        COALESCE(
          (SELECT json_agg(u)
           FROM (
             SELECT users_id, name, email, created_at
             FROM users
             WHERE builder_id = :builderId AND is_active = true${andWhen(sampleUsers)}
             ORDER BY created_at DESC
             LIMIT 3
           ) u
          ), '[]'
        ) AS users_data,
        (SELECT COUNT(*) FROM leads WHERE builder_id = :builderId AND is_deleted = false${andWhen(sampleLeads)}) AS lead_count,
        COALESCE(
          (SELECT json_agg(l)
           FROM (
             SELECT
               ld.leads_id,
               ld.name,
               ld.email,
               ld.created_at
             FROM leads ld
             WHERE ld.builder_id = :builderId
               AND ld.is_deleted = false${andWhen(sampleLeadRows)}
             ORDER BY ld.created_at DESC
             LIMIT 3
           ) l
          ), '[]'
        ) AS lead_data;
    `;

    const results = await db.sequelize.query(query, {
      replacements: { builderId, ...sampleUsers.replacements },
      type: db.Sequelize.QueryTypes.SELECT
    });

    const {
      contractor_count,
      contractor_data,
      users_count,
      users_data,
      lead_count,
      lead_data,
    } = results[0];

    const payload = keysToCamelCase({
      contractor_count,
      contractor_data,
      users_count,
      users_data,
      lead_count,
      lead_data,
    });

    await setCache(cacheKey, payload, WIDGET_CACHE_TTL_SECONDS);

    return successResponse(res, payload, "Dashboard data fetched successfully.");
  } catch (error) {
    console.error("Error in getDashboardData:", error);
    return errorResponse(
      res,
      error?.statusCode || 500,
      error?.message || "Internal Server Error",
    );
  }
}

export async function refreshWidgetsCache(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Builder or company ID missing");
    }

    await Promise.all([
      deleteCacheByPrefix(`dashboard:data:builder:${builderId || "na"}`),
      deleteCacheByPrefix(`job:list:builder:${builderId || "na"}:company:${companyId || "na"}:`),
    ]);

    return successResponse(res, {}, "Widget cache refreshed successfully.");
  } catch (error) {
    console.error("Error in refreshWidgetsCache:", error);
    return errorResponse(
      res,
      error?.statusCode || 400,
      error?.message || "Internal Server Error",
    );
  }
}
