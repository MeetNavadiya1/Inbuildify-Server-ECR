import { QueryTypes } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { ROLES } from "../../../constants/rbac.js";
import { applyColumnSearchFilters, applySampleDataScope } from "../report-filter.util.js";

/**
 * Job → Survey report. One row per survey_response (a survey sent to a
 * customer), with fixed fields plus a dynamic column per survey question
 * carrying that response's answer.
 *
 *   survey_response (Sent/Opened/Completed, submitted_at, recipient)
 *     └─ survey_response_answer (question_description + answer_text)
 */

const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

const SURVEY_JOINS = `
        FROM survey_response sr
        LEFT JOIN survey_template st ON sr.survey_template_id = st.survey_template_id
        LEFT JOIN leads l ON sr.lead_id = l.leads_id
        LEFT JOIN job j ON sr.job_id = j.job_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state pd_state ON pd.state_id = pd_state.state_id`;

export const SURVEY_FIELD_COLUMNS = [
  { key: "referenceId", label: "Reference ID", sortable: true },
  { key: "jobAddress", label: "Job Address" },
  { key: "surveyName", label: "Survey", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "sent", label: "Sent", sortable: true },
  { key: "submittedOn", label: "Submitted On", sortable: true },
  { key: "submittedBy", label: "Submitted By" },
];

function questionKey(description) {
  const slug = String(description || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return `q_${slug}`;
}

// Row scope: Sales Exec → own assigned lead; Agent → own created lead;
// Site Supervisor → own supervised job.
function applyScope(user, where, replacements) {
  if (user?.role_name === ROLES.SALES_EXECUTIVE) {
    where.push("l.assignee_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.AGENT) {
    where.push("l.created_by = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  } else if (user?.role_name === ROLES.SITE_SUPERVISOR) {
    where.push("j.supervisor_id = :scopeUserId");
    replacements.scopeUserId = user.users_id || user.id;
  }
}

/**
 * Distinct survey-question columns present in the builder's responses, ordered
 * by the template question sort order where available.
 */
export async function getSurveyQuestionColumns(builderId, companyId) {
  const rows = await db.sequelize.query(
    `SELECT sra.question_description AS description, MIN(COALESCE(stq.sort_order, 9999)) AS ord
     FROM survey_response_answer sra
     JOIN survey_response sr ON sra.survey_response_id = sr.survey_response_id
     LEFT JOIN survey_template_questions stq ON sra.survey_question_id = stq.survey_question_id
     WHERE (sr.builder_id = :builderId OR (sr.company_id = :companyId AND :companyId IS NOT NULL))
     GROUP BY sra.question_description
     ORDER BY MIN(COALESCE(stq.sort_order, 9999)) ASC, sra.question_description ASC`,
    { replacements: { builderId: builderId || null, companyId: companyId || null }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({ key: questionKey(r.description), label: r.description, isQuestion: true }));
}

export async function getSurveyReport({ builderId, companyId, user = null, filters = {} }) {
  const pageNum = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(filters.limit, 10) || 25, 1), 200);
  const offset = (pageNum - 1) * limitNum;
  const { search, status, survey_template_id, sort_by = "sent", sort_order = "desc" } = filters;

  const where = ["(sr.builder_id = :builderId OR (sr.company_id = :companyId AND :companyId IS NOT NULL))"];
  const replacements = { builderId: builderId || null, companyId: companyId || null, limit: limitNum, offset };
  applySampleDataScope(where, replacements, "l", "j");

  if (status) {
    where.push("sr.status = :status"); replacements.status = status;
  }
  if (survey_template_id) {
    where.push("sr.survey_template_id = :surveyTemplateId"); replacements.surveyTemplateId = survey_template_id;
  }
  if (search) {
    where.push(`(j.reference_number ILIKE :search OR l.reference_number ILIKE :search OR sr.recipient_name ILIKE :search OR sr.recipient_email ILIKE :search OR ${PROPERTY_ADDRESS_SQL} ILIKE :search)`);
    replacements.search = `%${search}%`;
  }
  applyColumnSearchFilters(where, replacements, filters, {
    reference: "COALESCE(j.reference_number, l.reference_number)",
    job_address: PROPERTY_ADDRESS_SQL,
    submitted_by: "sr.recipient_name",
  });
  applyScope(user, where, replacements);

  const whereClause = where.join(" AND ");
  const sortable = { referenceId: "COALESCE(j.reference_number, l.reference_number)", surveyName: "st.name", status: "sr.status", sent: "sr.created_at", submittedOn: "sr.submitted_at" };
  const orderCol = sortable[sort_by] || "sr.created_at";
  const orderDir = String(sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const dataQuery = `
        SELECT
          sr.survey_response_id AS "surveyResponseId",
          -- A survey hangs off a job or, before there is one, off the lead —
          -- either being seeded makes the response seeded. COALESCE because the
          -- job side is a LEFT JOIN and NULL OR false is NULL, not false.
          (COALESCE(j.is_sample_data, false) OR COALESCE(l.is_sample_data, false)) AS "isSampleData",
          COALESCE(j.reference_number, l.reference_number) AS "referenceId",
          ${PROPERTY_ADDRESS_SQL} AS "jobAddress",
          st.name AS "surveyName", sr.status AS "status",
          sr.created_at AS "sent", sr.submitted_at AS "submittedOn",
          COALESCE(sr.recipient_name, sr.recipient_email) AS "submittedBy"
        ${SURVEY_JOINS}
        WHERE ${whereClause}
        ORDER BY ${orderCol} ${orderDir} NULLS LAST
        LIMIT :limit OFFSET :offset`;
  const countQuery = `SELECT COUNT(*)::int AS total ${SURVEY_JOINS} WHERE ${whereClause}`;

  const [rows, countRows, questionColumns] = await Promise.all([
    db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
    db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT }),
    getSurveyQuestionColumns(builderId, companyId),
  ]);

  // Attach each response's answers as a { questionKey: answer } map.
  const responseIds = rows.map((r) => r.surveyResponseId);
  const answersByResponse = new Map();
  if (responseIds.length) {
    const answerRows = await db.sequelize.query(
      `SELECT survey_response_id, question_description, answer_text
       FROM survey_response_answer WHERE survey_response_id = ANY(ARRAY[:ids]::uuid[])`,
      { replacements: { ids: responseIds }, type: QueryTypes.SELECT },
    );
    for (const a of answerRows) {
      if (!answersByResponse.has(a.survey_response_id)) {
        answersByResponse.set(a.survey_response_id, {});
      }
      answersByResponse.get(a.survey_response_id)[questionKey(a.question_description)] = a.answer_text;
    }
  }

  const total = countRows[0]?.total || 0;
  return {
    columns: { fields: SURVEY_FIELD_COLUMNS, questions: questionColumns },
    rows: rows.map((r) => {
      const camel = keysToCamelCase(r);
      camel.answers = answersByResponse.get(r.surveyResponseId) || {};
      return camel;
    }),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
}

export default { getSurveyReport, getSurveyQuestionColumns };
