import Joi from "joi";

/**
 * Length limits here are a first line only — the service sanitises and re-caps
 * everything it stores (utils/htmlSanitizer.js). Joi's job is to reject the
 * obviously wrong SHAPE early; it must never be the only thing standing between
 * builder HTML and a public page.
 */

const sectionSchema = Joi.object({
  id: Joi.string().trim().max(64).allow("", null),
  title: Joi.string().trim().max(200).allow("", null),
  body: Joi.string().max(25000).allow("", null),
});

export const saveTermsSchema = Joi.object({
  title: Joi.string().trim().max(255).allow("", null),
  intro: Joi.string().max(25000).allow("", null),
  sections: Joi.array().items(sectionSchema).max(60).default([]),
  footer_note: Joi.string().max(10000).allow("", null),
});

export const syncTermsSchema = Joi.object({
  // No default: the whole point of the dialog is that the user chooses, so a
  // request that forgot to send one is a bug worth surfacing, not a silent
  // "missing" run.
  scope: Joi.string().valid("all", "missing").required().messages({
    "any.only": "scope must be either 'all' or 'missing'.",
    "any.required": "Choose whether to sync all quotations or only those without terms.",
  }),
});

export const versionIdParamsSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required().messages({
    "string.guid": "quotation_version_id must be a valid UUID.",
  }),
});

export const publicTokenParamsSchema = Joi.object({
  // Hex from crypto.randomBytes — anything else cannot be a token we issued, so
  // it is rejected before it reaches the database.
  token: Joi.string().trim().hex().length(32).required().messages({
    "string.hex": "Invalid terms link.",
    "string.length": "Invalid terms link.",
  }),
});

export default {
  saveTermsSchema,
  syncTermsSchema,
  versionIdParamsSchema,
  publicTokenParamsSchema,
};
