import Joi from "joi";

export const sendSurveySchema = Joi.object({
  survey_template_id: Joi.string().uuid().required().messages({
    "any.required": "survey_template_id is required.",
    "string.guid": "survey_template_id must be a valid UUID.",
  }),
  lead_id: Joi.string().uuid().optional().messages({
    "string.guid": "lead_id must be a valid UUID.",
  }),
  job_id: Joi.string().uuid().optional().messages({
    "string.guid": "job_id must be a valid UUID.",
  }),
  recipient_email: Joi.string().trim().email().optional().messages({
    "string.email": "recipient_email must be a valid email address.",
  }),
})
  .or("lead_id", "job_id")
  .messages({ "object.missing": "Either lead_id or job_id is required." });

export const listSurveyResponsesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  lead_id: Joi.string().uuid().optional().messages({
    "string.guid": "lead_id must be a valid UUID.",
  }),
  job_id: Joi.string().uuid().optional().messages({
    "string.guid": "job_id must be a valid UUID.",
  }),
  survey_template_id: Joi.string().uuid().optional().messages({
    "string.guid": "survey_template_id must be a valid UUID.",
  }),
  status: Joi.string().valid("Sent", "Opened", "Completed").optional().messages({
    "any.only": "status must be one of Sent, Opened, Completed.",
  }),
});

export const surveyResponseIdParamsSchema = Joi.object({
  survey_response_id: Joi.string().uuid().required().messages({
    "any.required": "survey_response_id is required.",
    "string.guid": "survey_response_id must be a valid UUID.",
  }),
});

export const surveyTokenParamsSchema = Joi.object({
  token: Joi.string().trim().min(10).max(255).required().messages({
    "any.required": "token is required.",
    "string.empty": "token is required.",
  }),
});

export const submitSurveySchema = Joi.object({
  answers: Joi.array()
    .items(
      Joi.object({
        survey_question_id: Joi.string().uuid().required().messages({
          "any.required": "survey_question_id is required for each answer.",
          "string.guid": "survey_question_id must be a valid UUID.",
        }),
        answer: Joi.alternatives()
          .try(Joi.string().allow("").trim(), Joi.number())
          .required()
          .messages({
            "any.required": "answer is required for each item.",
          }),
      }),
    )
    .min(1)
    .required()
    .messages({
      "array.min": "At least one answer must be provided.",
      "any.required": "answers is required.",
    }),
});

export default {
  sendSurveySchema,
  listSurveyResponsesSchema,
  surveyResponseIdParamsSchema,
  surveyTokenParamsSchema,
  submitSurveySchema,
};
