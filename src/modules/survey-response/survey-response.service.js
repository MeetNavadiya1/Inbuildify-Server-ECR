import crypto from "crypto";
import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { env } from "../../config/env.config.js";
import sendEmail from "../../service/sendMail.service.js";
import { wrapSurveyEmailHTML } from "../../templates/survey-email.template.js";

const STAR_RANGE = {
  star_1_to_5: { min: 1, max: 5 },
  star_1_to_10: { min: 1, max: 10 },
};

function generateAccessToken() {
  return crypto.randomBytes(24).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function buildSurveyUrl(token) {
  const base = env.EMAIL?.FRONTEND_BASE_URL || "";
  return `${base}/survey/respond?token=${encodeURIComponent(token)}`;
}

/**
 * Sends a survey (built from a template) to a lead via email and records the request.
 */
export const sendSurveyService = async ({ builderId, companyId, userId, data }) => {
  const { SurveyTemplate, SurveyTemplateQuestions, Leads, Job, Opportunity, SurveyResponse, sequelize } = db;

  if (!builderId) {
    const error = new Error("Unauthorized.");
    error.status = 401;
    throw error;
  }

  const { survey_template_id, recipient_email } = data;
  let { lead_id } = data;
  const { job_id } = data;

  // 1. Validate template belongs to builder and is active
  const template = await SurveyTemplate.findOne({
    where: { survey_template_id, builder_id: builderId, status: true },
  });
  if (!template) {
    const error = new Error("Survey template not found, inactive, or not owned by this builder.");
    error.status = 404;
    throw error;
  }

  // 2. Ensure the template has at least one question
  const questionCount = await SurveyTemplateQuestions.count({ where: { survey_template_id } });
  if (questionCount === 0) {
    const error = new Error("Cannot send a survey template that has no questions.");
    error.status = 400;
    throw error;
  }

  // 3. If sending from a job, validate the job belongs to the builder and
  //    resolve its lead (used when lead_id isn't explicitly supplied).
  if (job_id) {
    const job = await Job.findOne({
      where: { job_id, builder_id: builderId },
      include: [{ model: Opportunity, as: "opportunity", attributes: ["opportunity_id", "leads_id"] }],
    });
    if (!job) {
      const error = new Error("Job not found or not owned by this builder.");
      error.status = 404;
      throw error;
    }
    if (!lead_id) {
      lead_id = job.opportunity?.leads_id || null;
    }
  }

  if (!lead_id) {
    const error = new Error("Unable to determine the lead for this survey.");
    error.status = 400;
    throw error;
  }

  // 4. Validate lead belongs to builder
  const lead = await Leads.findOne({
    where: { leads_id: lead_id, builder_id: builderId },
    attributes: ["leads_id", "name", "email"],
  });
  if (!lead) {
    const error = new Error("Lead not found or not owned by this builder.");
    error.status = 404;
    throw error;
  }

  // 4. Resolve recipient email (explicit override wins, else lead email)
  const toEmail = (recipient_email || lead.email || "").trim();
  if (!toEmail) {
    const error = new Error("No recipient email available. Provide recipient_email or set an email on the lead.");
    error.status = 400;
    throw error;
  }

  // 5. Create the survey_response record with a unique persistent token
  const accessToken = generateAccessToken();
  const transaction = await sequelize.transaction();
  let created;
  try {
    created = await SurveyResponse.create(
      {
        survey_template_id,
        lead_id,
        job_id: job_id || null,
        company_id: companyId || null,
        builder_id: builderId,
        recipient_name: lead.name || null,
        recipient_email: toEmail,
        access_token: accessToken,
        status: "Sent",
        sent_by: userId || null,
      },
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  // 6. Send the invitation email (queued). A delivery failure should not
  //    lose the created request — surface it but keep the record.
  const surveyUrl = buildSurveyUrl(accessToken);
  const html = wrapSurveyEmailHTML({
    recipientName: lead.name,
    surveyName: template.name,
    surveyUrl,
  });
  const text = `You've been invited to complete the survey "${template.name}". Open this link to respond: ${surveyUrl}`;

  let emailQueued = true;
  try {
    await sendEmail(toEmail, `Survey: ${template.name}`, text, html);
  } catch (err) {
    console.error("sendSurveyService: failed to queue survey email:", err.message);
    emailQueued = false;
  }

  return {
    ...keysToCamelCase(created.toJSON()),
    surveyUrl,
    emailQueued,
  };
};

/**
 * Lists survey responses for the builder with filtering + pagination.
 */
export const listSurveyResponsesService = async ({ builderId, query }) => {
  const { SurveyResponse, SurveyTemplate, Leads } = db;

  const { page = 1, limit = 25, lead_id, job_id, survey_template_id, status } = query;

  const limitValue = parseInt(limit, 10) || 25;
  const pageValue = parseInt(page, 10) || 1;
  const offset = (pageValue - 1) * limitValue;

  const where = { builder_id: builderId };
  if (lead_id) where.lead_id = lead_id;
  if (job_id) where.job_id = job_id;
  if (survey_template_id) where.survey_template_id = survey_template_id;
  if (status && ["Sent", "Opened", "Completed"].includes(status)) where.status = status;

  const { count: totalRecords, rows } = await SurveyResponse.findAndCountAll({
    where,
    include: [
      { model: SurveyTemplate, as: "surveyTemplate", attributes: ["survey_template_id", "name"] },
      { model: Leads, as: "lead", attributes: ["leads_id", "name", "email"] },
    ],
    order: [["created_at", "DESC"]],
    limit: limitValue,
    offset,
    distinct: true,
  });

  return {
    surveyResponses: keysToCamelCase(rows.map((r) => r.toJSON())),
    pagination: {
      currentPage: pageValue,
      totalPages: Math.ceil(totalRecords / limitValue),
      totalRecords,
      limit: limitValue,
    },
  };
};

/**
 * Fetches a single survey response with its answers (builder-side results view).
 */
export const getSurveyResponseByIdService = async ({ builderId, surveyResponseId }) => {
  const { SurveyResponse, SurveyTemplate, Leads, SurveyResponseAnswer } = db;

  const response = await SurveyResponse.findOne({
    where: { survey_response_id: surveyResponseId, builder_id: builderId },
    include: [
      { model: SurveyTemplate, as: "surveyTemplate", attributes: ["survey_template_id", "name"] },
      { model: Leads, as: "lead", attributes: ["leads_id", "name", "email"] },
      { model: SurveyResponseAnswer, as: "answers" },
    ],
    order: [[{ model: SurveyResponseAnswer, as: "answers" }, "created_at", "ASC"]],
  });

  if (!response) {
    const error = new Error("Survey response not found or not owned by this builder.");
    error.status = 404;
    throw error;
  }

  return keysToCamelCase(response.toJSON());
};

/**
 * PUBLIC: loads the survey (template + questions) for a recipient by access token.
 * Flips status Sent -> Opened on first view.
 */
export const getPublicSurveyByTokenService = async (token) => {
  const { SurveyResponse, SurveyTemplate, SurveyTemplateQuestions } = db;

  const response = await SurveyResponse.findOne({
    where: { access_token: token },
    include: [{ model: SurveyTemplate, as: "surveyTemplate", attributes: ["survey_template_id", "name"] }],
  });

  if (!response) {
    const error = new Error("Survey link is invalid or has expired.");
    error.status = 404;
    throw error;
  }

  const questions = await SurveyTemplateQuestions.findAll({
    where: { survey_template_id: response.survey_template_id },
    attributes: ["survey_question_id", "description", "option_type", "options", "is_required", "sort_order"],
    order: [["sort_order", "ASC"]],
  });

  if (response.status === "Sent") {
    await response.update({ status: "Opened" });
  }

  return {
    surveyResponseId: response.survey_response_id,
    surveyName: response.surveyTemplate?.name || "",
    recipientName: response.recipient_name || "",
    status: response.status,
    alreadyCompleted: response.status === "Completed",
    questions: keysToCamelCase(questions.map((q) => q.toJSON())),
  };
};

/**
 * PUBLIC: stores a recipient's answers and marks the survey completed.
 */
export const submitPublicSurveyService = async (token, payload) => {
  const { SurveyResponse, SurveyTemplateQuestions, SurveyResponseAnswer, sequelize } = db;

  const response = await SurveyResponse.findOne({ where: { access_token: token } });
  if (!response) {
    const error = new Error("Survey link is invalid or has expired.");
    error.status = 404;
    throw error;
  }
  if (response.status === "Completed") {
    const error = new Error("This survey has already been submitted.");
    error.status = 409;
    throw error;
  }

  const questions = await SurveyTemplateQuestions.findAll({
    where: { survey_template_id: response.survey_template_id },
    order: [["sort_order", "ASC"]],
  });
  const questionMap = new Map(questions.map((q) => [q.survey_question_id, q]));

  // Index submitted answers by question id (last one wins)
  const submitted = new Map();
  for (const a of payload.answers || []) {
    submitted.set(a.survey_question_id, a.answer);
  }

  const answerRows = [];
  for (const q of questions) {
    const raw = submitted.get(q.survey_question_id);
    const provided = raw !== undefined && raw !== null && String(raw).trim() !== "";

    if (!provided) {
      if (q.is_required) {
        const error = new Error(`An answer is required for: "${q.description}".`);
        error.status = 400;
        throw error;
      }
      continue; // optional + unanswered -> skip
    }

    const value = String(raw).trim();

    // Validate answer against the question type
    if (q.option_type === "radio") {
      const opts = Array.isArray(q.options) ? q.options : [];
      if (!opts.includes(value)) {
        const error = new Error(`Invalid option for: "${q.description}".`);
        error.status = 400;
        throw error;
      }
    } else if (STAR_RANGE[q.option_type]) {
      const num = Number(value);
      const { min, max } = STAR_RANGE[q.option_type];
      if (!Number.isInteger(num) || num < min || num > max) {
        const error = new Error(`Rating for "${q.description}" must be an integer between ${min} and ${max}.`);
        error.status = 400;
        throw error;
      }
    }

    answerRows.push({
      survey_response_id: response.survey_response_id,
      survey_question_id: q.survey_question_id,
      question_description: q.description,
      option_type: q.option_type,
      answer_text: value,
    });
  }

  // Reject answers referencing questions that don't belong to this survey
  for (const qid of submitted.keys()) {
    if (!questionMap.has(qid)) {
      const error = new Error("One or more answers reference an unknown question.");
      error.status = 400;
      throw error;
    }
  }

  const transaction = await sequelize.transaction();
  try {
    // Idempotency guard: clear any partial answers before storing final set
    await SurveyResponseAnswer.destroy({
      where: { survey_response_id: response.survey_response_id },
      transaction,
    });
    if (answerRows.length) {
      await SurveyResponseAnswer.bulkCreate(answerRows, { transaction });
    }
    await response.update({ status: "Completed", submitted_at: new Date() }, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return {
    surveyResponseId: response.survey_response_id,
    status: "Completed",
    answeredCount: answerRows.length,
  };
};

export default {
  sendSurveyService,
  listSurveyResponsesService,
  getSurveyResponseByIdService,
  getPublicSurveyByTokenService,
  submitPublicSurveyService,
};
