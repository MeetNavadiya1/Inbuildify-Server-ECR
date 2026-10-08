import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { applyColumnSearchFilters, applySampleDataScope } from "../report-filter.util.js";

/**
 * Job → Land Title Forecast report. One row per job, focused on land title
 * status/dates and the job's current stage.
 *
 * Best-effort: Site Start Date → job.preconstruction_closed_at (no dedicated
 * site-start column). ConsStageName = the job's current (first incomplete)
 * sub-stage overall; WorkflowStageName = current sub-stage restricted to
 * workflow functionalities.
 */

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

export const LAND_TITLE_FORECAST_COLUMNS = [
  { key: "referenceId", label: "Reference ID", sortable: true },
  { key: "customerName", label: "Customer Name", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "builderName", label: "Builder Name" },
  { key: "dwellingType", label: "Dwelling Type" },
  { key: "titleStatus", label: "Title Status", sortable: true },
  { key: "landTitleDate", label: "Land TitleDate", sortable: true },
  { key: "siteStartDate", label: "Site StartDate" },
  { key: "estateName", label: "Estate Name", sortable: true },
  { key: "consultant", label: "Consultant" },
  { key: "consStageName", label: "ConsStageName" },
  { key: "workflowStageName", label: "WorkflowStageName" },
];

const JOB_JOINS = `
        FROM job j
        LEFT JOIN opportunity o ON j.opportunity_id = o.opportunity_id
        LEFT JOIN leads l ON o.leads_id = l.leads_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id
        LEFT JOIN estate est ON pd.estate_id = est.estate_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        LEFT JOIN builder b ON j.builder_id = b.builder_id
        LEFT JOIN quotation_version qv ON j.quotation_version_id = qv.quotation_version_id
        LEFT JOIN floor_plan fp ON qv.floor_plan_id = fp.floor_plan_id
        LEFT JOIN dwelling_type dt ON fp.dwelling_type_id = dt.dwelling_type_id`;

function applyJobScope(user, where, replacements) {
  if (user?.role_name === ROLES.SITE_SUPERVISOR) {
    where.push("j.supervisor_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.CONTACT) {
    where.push("j.customer_contact_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  }
}

export async function getLandTitleForecastReport({ builderId, companyId, user = null, filters = {} }) {
  const pageNum = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(filters.limit, 10) || 25, 1), 200);
  const offset = (pageNum - 1) * limitNum;
  const { search, title_status, dwelling_type_id, sort_by = "landTitleDate", sort_order = "asc" } = filters;

  const where = ["(j.builder_id = :builderId OR (j.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "j");

  if (title_status) {
    where.push("pd.title_status = :titleStatus"); replacements.titleStatus = title_status;
  }
  if (dwelling_type_id) {
    where.push("fp.dwelling_type_id = :dwellingTypeId"); replacements.dwellingTypeId = dwelling_type_id;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "j.reference_number",
    customer_name: "l.name",
    job_address: PROPERTY_ADDRESS_SQL,
    builder_name: "b.name",
    estate_name: "est.name",
  });
  if (search) {
    where.push(`(j.reference_number ILIKE :search OR l.name ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyJobScope(user, where, replacements);
  const whereClause = where.join(" AND ");

  const sortable = { referenceId: "j.reference_number", customerName: "l.name", titleStatus: "pd.title_status", landTitleDate: "pd.title_date", estateName: "est.name" };
  const orderCol = sortable[sort_by] || "pd.title_date";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  // Current sub-stage overall vs current sub-stage among workflow functionalities.
  const currentStage = (workflowOnly) => `(
          SELECT jss.name FROM job_sub_stage jss
          ${workflowOnly ? "JOIN job_process_stage jps ON jss.stage_id = jps.stage_id JOIN job_process_stage_functionality func ON jps.functionality_id = func.functionality_id AND func.is_workflow = true" : ""}
          WHERE jss.job_id = j.job_id AND jss.is_synced = true AND jss.is_completed = false AND jss.is_skipped = false
          ORDER BY jss.sort_order ASC LIMIT 1)`;

  const dataQuery = `
        SELECT
          j.is_sample_data AS "isSampleData",
          j.reference_number AS "referenceId", l.name AS "customerName", ${PROPERTY_ADDRESS_SQL} AS "jobAddress",
          b.name AS "builderName", dt.name AS "dwellingType", pd.title_status AS "titleStatus",
          pd.title_date AS "landTitleDate", j.preconstruction_closed_at AS "siteStartDate",
          COALESCE(pd.estate_name, est.name) AS "estateName", assignee.name AS "consultant",
          ${currentStage(false)} AS "consStageName", ${currentStage(true)} AS "workflowStageName"
        ${JOB_JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total ${JOB_JOINS} WHERE ${whereClause}`;

  const [rows, countRows] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
  ]);
  const total = countRows[0]?.total || 0;

  return {
    columns: LAND_TITLE_FORECAST_COLUMNS,
    rows: rows.map((r) => keysToCamelCase(r)),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

export default { getLandTitleForecastReport };
