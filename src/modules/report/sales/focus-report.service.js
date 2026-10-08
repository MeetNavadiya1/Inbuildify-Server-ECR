import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { LEAD_FOCUS_COLUMNS, LEAD_FOCUS_SORTABLE } from "../report-columns.catalog.js";
import { applySampleDataScope } from "../report-filter.util.js";

// Property-address concat for the per-column filter (matches the pd / pd_state
// joins in the report query, and the propertyAddress column's own expression).
const PROPERTY_ADDRESS_FILTER_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

/**
 * Resolve the `created_at` named range filter (last_7_days, today, …) into a
 * concrete start/end window. Mirrors the switch in leads.repository.getAllLeads
 * so the report and the lead list stay consistent.
 */
function resolveDateRange(createdAt) {
  const now = new Date();
  let start;
  let end;
  switch (String(createdAt).toLowerCase()) {
  case "last_15_minutes": start = new Date(now.getTime() - 15 * 60 * 1000); break;
  case "last_1_hour": start = new Date(now.getTime() - 60 * 60 * 1000); break;
  case "last_2_hours": start = new Date(now.getTime() - 2 * 60 * 60 * 1000); break;
  case "last_24_hours": start = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
  case "today": start = new Date(now.setHours(0, 0, 0, 0)); break;
  case "yesterday":
    start = new Date(new Date().setHours(0, 0, 0, 0) - 24 * 60 * 60 * 1000);
    end = new Date(new Date().setHours(0, 0, 0, 0));
    break;
  case "last_7_days": start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
  case "last_15_days": start = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); break;
  case "last_30_days": start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
  }
  return { start, end };
}

/**
 * Fetch paginated Lead/Focus report rows for a builder/company, honouring the
 * report filters and Sales-Exec/Agent row-level scoping.
 *
 * @param {object} args
 * @param {string} args.builderId
 * @param {string} args.companyId
 * @param {object} args.user   - req.user (needs role_name for row scoping)
 * @param {object} args.filters
 */
export async function getFocusReport({ builderId, companyId, user = null, filters = {} }) {
  const {
    page = 1,
    limit = 25,
    status,
    rating,
    lead_source_id,
    client_type_id,
    region_id,
    assignee_id,
    dwelling_type_id,
    search,
    reference,
    name,
    email,
    contact,
    property_address,
    created_at,
    created_from,
    created_to,
    updated_at,
    updated_from,
    updated_to,
    sort_by = "created",
    sort_order = "desc",
  } = filters;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
  const offset = (pageNum - 1) * limitNum;

  const where = ["(l.builder_id = :builderId OR (l.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "l");

  // Date range: explicit from/to takes precedence over the named range.
  if (created_from || created_to) {
    if (created_from) {
      where.push("l.created_at >= :createdFrom");
      replacements.createdFrom = new Date(created_from).toISOString();
    }
    if (created_to) {
      where.push("l.created_at <= :createdTo");
      replacements.createdTo = new Date(created_to).toISOString();
    }
  } else if (created_at) {
    const { start, end } = resolveDateRange(created_at);
    if (start && end) {
      where.push("l.created_at >= :dateStart AND l.created_at < :dateEnd");
      replacements.dateStart = start.toISOString();
      replacements.dateEnd = end.toISOString();
    } else if (start) {
      where.push("l.created_at >= :dateStart");
      replacements.dateStart = start.toISOString();
    }
  }

  // Updated-date range (mirrors created), explicit from/to before named range.
  if (updated_from || updated_to) {
    if (updated_from) {
      where.push("l.updated_at >= :updatedFrom");
      replacements.updatedFrom = new Date(updated_from).toISOString();
    }
    if (updated_to) {
      where.push("l.updated_at <= :updatedTo");
      replacements.updatedTo = new Date(updated_to).toISOString();
    }
  } else if (updated_at) {
    const { start, end } = resolveDateRange(updated_at);
    if (start && end) {
      where.push("l.updated_at >= :uStart AND l.updated_at < :uEnd");
      replacements.uStart = start.toISOString();
      replacements.uEnd = end.toISOString();
    } else if (start) {
      where.push("l.updated_at >= :uStart");
      replacements.uStart = start.toISOString();
    }
  }

  if (status) {
    where.push("(l.status = :status OR EXISTS (SELECT 1 FROM opportunity o WHERE o.leads_id = l.leads_id AND o.status = :status))");
    replacements.status = status;
  }
  if (rating?.length) {
    where.push("l.rating = ANY(ARRAY[:rating])");
    replacements.rating = rating;
  }
  if (lead_source_id?.length) {
    where.push("l.lead_source_id = ANY(ARRAY[:leadSourceId]::uuid[])");
    replacements.leadSourceId = lead_source_id;
  }
  if (client_type_id) {
    where.push("l.client_type_id = :clientTypeId");
    replacements.clientTypeId = client_type_id;
  }
  if (region_id) {
    where.push("l.region_id = :regionId");
    replacements.regionId = region_id;
  }
  if (assignee_id?.length) {
    where.push("l.assignee_id = ANY(ARRAY[:assigneeId]::uuid[])");
    replacements.assigneeId = assignee_id;
  }
  if (search) {
    where.push("(l.name ILIKE :search OR l.email ILIKE :search OR l.phone ILIKE :search OR l.reference_number ILIKE :search)");
    replacements.search = `%${search}%`;
  }

  // Per-column text filters (each independent, ANDed with the rest).
  if (reference) {
    where.push("l.reference_number ILIKE :fReference"); replacements.fReference = `%${reference}%`;
  }
  if (name) {
    where.push("l.name ILIKE :fName"); replacements.fName = `%${name}%`;
  }
  if (email) {
    where.push("l.email ILIKE :fEmail"); replacements.fEmail = `%${email}%`;
  }
  if (contact) {
    where.push("l.phone ILIKE :fContact"); replacements.fContact = `%${contact}%`;
  }
  if (property_address) {
    where.push(`${PROPERTY_ADDRESS_FILTER_SQL} ILIKE :fAddress`);
    replacements.fAddress = `%${property_address}%`;
  }

  // Dwelling Type filter — matches the lead's H&L package OR latest quotation
  // floor plan dwelling type (the same two sources the column selects).
  if (dwelling_type_id) {
    where.push(`(
      EXISTS (SELECT 1 FROM house_land_package hlp JOIN floor_plan fp ON hlp.floor_plan_id = fp.floor_plan_id WHERE hlp.house_land_package_id = l.house_land_package_id AND fp.dwelling_type_id = :dwellingTypeId)
      OR EXISTS (SELECT 1 FROM quotation q JOIN quotation_version qv ON qv.quotation_id = q.quotation_id JOIN floor_plan fp ON qv.floor_plan_id = fp.floor_plan_id WHERE q.leads_id = l.leads_id AND fp.dwelling_type_id = :dwellingTypeId)
    )`);
    replacements.dwellingTypeId = dwelling_type_id;
  }

  // Row-level scoping: Sales Executive → own assigned leads; Agent → own
  // created leads. Builder/manager/admin tiers are unaffected. Mirrors
  // applyRowScope + LEAD_SCOPE_COLUMNS used by the lead list.
  if (user?.role_name === ROLES.SALES_EXECUTIVE) {
    where.push("l.assignee_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.AGENT) {
    where.push("l.created_by = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  }

  const whereClause = where.join(" AND ");

  // ORDER BY whitelist — falls back to created_at when the key isn't sortable.
  const orderColumn = LEAD_FOCUS_SORTABLE[sort_by] || "l.created_at";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  // Build the SELECT list from the catalog so it never drifts from the columns.
  const selectList = LEAD_FOCUS_COLUMNS.map((c) => `${c.select} AS "${c.key}"`).join(",\n          ");

  const customFieldsSelect = `(
            SELECT COALESCE(json_object_agg(cfv.custom_field_id, COALESCE(cfv.value_text, cfv.value_number::text, cfv.value_date::text, cfv.value_boolean::text, cfv.value_list)), '{}'::json)
            FROM custom_field_value cfv
            JOIN custom_field cf ON cf.custom_field_id = cfv.custom_field_id
            JOIN custom_field_module cfm ON cf.module_id = cfm.module_id AND cfm.name = 'Lead'
            WHERE cfv.record_id = l.leads_id
          ) AS "customFields"`;

  const fromAndJoins = `
        FROM leads l
        LEFT JOIN lead_source ls ON l.lead_source_id = ls.lead_source_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN client_type ct ON l.client_type_id = ct.client_type_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        LEFT JOIN lead_lost_reason llr ON l.lead_lost_reason_id = llr.lead_lost_reason_id
        WHERE ${whereClause}`;

  // Selected but absent from the column catalog on purpose: the UI badges the
  // reference cell from it rather than giving it a column of its own, and the
  // Excel export is built from the catalog, so it stays out of the file too.
  const dataQuery = `
        SELECT
          l.leads_id AS "leadsId",
          l.is_sample_data AS "isSampleData",
          ${selectList},
          ${customFieldsSelect}
        ${fromAndJoins}
        ORDER BY ${orderColumn} ${orderDir} NULLS LAST, l.updated_at DESC NULLS LAST
        LIMIT :limit OFFSET :offset`;

  // Count needs the property_detail/state joins too, since the property_address
  // per-column filter references them in the WHERE clause.
  const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM leads l
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        WHERE ${whereClause}`;

  const [rows, countRows] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
  ]);

  const total = countRows[0]?.total || 0;

  return {
    rows: rows.map((r) => keysToCamelCase(r)),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

export default { getFocusReport };
