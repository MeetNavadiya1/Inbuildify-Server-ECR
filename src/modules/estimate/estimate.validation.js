import Joi from "joi";

import { MAX_FORMULA_LENGTH } from "../../utils/estimateFormula.js";
import { INPUT_TYPES, VARIABLE_PATTERN } from "./estimate.service.js";

/**
 * Schemas run AFTER camelToSnakeMiddleware, so keys are snake_case here even
 * though the client sends camelCase.
 */

const variable = Joi.string()
  .trim()
  .lowercase()
  .max(60)
  .pattern(VARIABLE_PATTERN)
  .allow("", null)
  .messages({
    "string.pattern.base":
      "Variable must start with a letter and use only lowercase letters, numbers and underscores.",
    "string.max": "Variable must be at most 60 characters.",
  });

const optionalText = (max) => Joi.string().trim().max(max).allow("", null);

const formula = Joi.string().trim().max(MAX_FORMULA_LENGTH).allow("", null).messages({
  "string.max": `Formula must be at most ${MAX_FORMULA_LENGTH} characters.`,
});

const option = Joi.object({
  label: Joi.string().trim().max(80).required().messages({
    "string.empty": "Every dropdown option needs a label.",
    "any.required": "Every dropdown option needs a label.",
  }),
  value: Joi.number().required().messages({
    "number.base": "Every dropdown option needs a numeric value.",
    "any.required": "Every dropdown option needs a numeric value.",
  }),
});

const sortOrder = Joi.number().integer().min(1).max(10000).messages({
  "number.base": "Order must be a whole number from 1 to 10,000.",
  "number.integer": "Order must be a whole number from 1 to 10,000.",
  "number.min": "Order must be a whole number from 1 to 10,000.",
  "number.max": "Order must be a whole number from 1 to 10,000.",
});

/** A display name: required text with at least one letter in it. */
const displayName = (noun) =>
  Joi.string()
    .trim()
    .max(120)
    .pattern(/[A-Za-z]/)
    .messages({
      "string.empty": `${noun} is required.`,
      "string.max": `${noun} must be at most 120 characters.`,
      "string.pattern.base": `${noun} must contain at least one letter.`,
    });

const unit = Joi.string().trim().max(30).messages({
  "string.empty": "Unit is required — e.g. pcs, bag, kg.",
  "string.max": "Unit must be at most 30 characters.",
});

/**
 * "Apply changes to existing jobs?" — true applies the change to jobs that
 * already exist, false protects them from it. Optional on purpose: left out, the
 * write leaves the existing arrangement exactly as it is, which is what the
 * Estimate & Dashboard's incidental default-value autosave needs.
 */
const applyToExistingJobs = Joi.boolean().messages({
  "boolean.base": "Choose whether to apply this change to existing jobs.",
});

/** The same question on a DELETE, which carries it in the query string. */
export const applyToExistingJobsQuerySchema = Joi.object({
  apply_to_existing_jobs: applyToExistingJobs,
}).unknown(true);

export const loadTemplateSchema = Joi.object({
  apply_to_existing_jobs: applyToExistingJobs,
});

export const idParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Id must be a valid UUID.",
    "any.required": "Id is required.",
  }),
});

const parameterFields = {
  label: displayName("Parameter name"),
  variable,
  input_type: Joi.string().valid(...INPUT_TYPES).messages({
    "any.only": `Type must be one of: ${INPUT_TYPES.join(", ")}.`,
  }),
  unit: optionalText(30),
  options: Joi.array().items(option).max(50).messages({
    "array.max": "A dropdown can have at most 50 options.",
  }),
  default_value: Joi.number().allow(null).messages({
    "number.base": "Default value must be a number.",
  }),
  formula,
  description: optionalText(500),
  sort_order: sortOrder,
  is_active: Joi.boolean(),
  apply_to_existing_jobs: applyToExistingJobs,
};

export const createParameterSchema = Joi.object({
  ...parameterFields,
  label: parameterFields.label.required().messages({ "any.required": "Parameter name is required." }),
});

export const updateParameterSchema = Joi.object(parameterFields).min(1);

const materialFields = {
  name: displayName("Material name"),
  variable,
  // Required on create (below); on update it may be left out, not blanked.
  unit,
  formula: Joi.string().trim().max(MAX_FORMULA_LENGTH).messages({
    "string.empty": "Formula is required.",
    "string.max": `Formula must be at most ${MAX_FORMULA_LENGTH} characters.`,
  }),
  unit_price: Joi.number().greater(0).max(1e10).precision(4).messages({
    "number.base": "Unit price must be a number.",
    "number.greater": "Unit price must be more than $0.",
    "number.max": "Unit price is too large.",
  }),
  description: optionalText(500),
  sort_order: sortOrder,
  is_active: Joi.boolean(),
  apply_to_existing_jobs: applyToExistingJobs,
};

export const createMaterialSchema = Joi.object({
  ...materialFields,
  name: materialFields.name.required().messages({ "any.required": "Material name is required." }),
  formula: materialFields.formula.required().messages({ "any.required": "Formula is required." }),
  unit: materialFields.unit.required().messages({ "any.required": "Unit is required — e.g. pcs, bag, kg." }),
  unit_price: materialFields.unit_price
    .required()
    .messages({ "any.required": "Unit price is required." }),
});

export const updateMaterialSchema = Joi.object(materialFields).min(1);

export const checkFormulaSchema = Joi.object({
  formula: Joi.string().allow("").max(MAX_FORMULA_LENGTH).required(),
  kind: Joi.string().valid("parameter", "material").required(),
  id: Joi.string().uuid().allow(null),
  variable,
});

export const calculateSchema = Joi.object({
  values: Joi.array()
    .items(
      Joi.object({
        variable: Joi.string().trim().max(60).required(),
        value: Joi.number().allow(null),
      }),
    )
    .max(500)
    .default([]),
});

/** Job-wise estimates. The route declares the param as `:job_id`. */
export const jobParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "Job id must be a valid UUID.",
    "any.required": "Job id is required.",
  }),
});

/** The same { variable, value } list as /calculate — saved against the job. */
export const saveJobValuesSchema = calculateSchema;
