import Joi from "joi";
import { indianPhoneProblem } from "../city/city.data.js";

const AUSTRALIAN_PHONE = /^(?:\+?61\s*\(?|0\s*\(?|\(0)[2-57-8]\)?\s*(?:[ -]?\d){8}$/;

// An Australian or an Indian number. Leads, contacts and users are saved from
// forms whose country may be either, and a lead carries no country at all, so
// either numbering plan is accepted here.
export const phoneRule = Joi.string()
  .min(10)
  .max(17)
  .optional()
  .allow(null, "")
  .custom((value, helpers) =>
    AUSTRALIAN_PHONE.test(value) || indianPhoneProblem(value) === null
      ? value
      : helpers.error("string.pattern.base"),
  )
  .messages({
    "string.min": "Phone must be at least 10 characters long",
    "string.max": "Phone must not exceed 17 characters",
    "string.pattern.base": "Please provide a valid Australian or Indian phone number",
  });

export const createLeadSchema = Joi.object({
  force_create: Joi.boolean().optional().default(false),
  name: Joi.string().min(2).max(255).required().messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name must not exceed 255 characters",
    "any.required": "Name is required",
  }),
  email: Joi.string().email().max(255).optional().allow(null, "").messages({
    "string.email": "Please provide a valid email address",
    "string.max": "Email must not exceed 255 characters",
  }),
  phone: phoneRule,
  notes: Joi.string().max(1000).optional().allow(null, "").messages({
    "string.max": "Notes must not exceed 1000 characters",
  }),
  send_letter: Joi.boolean().optional().default(false),
  lead_source_id: Joi.string().uuid().required().allow(null).messages({
    "string.guid": "Lead source ID must be a valid UUID",
  }),
  facade_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Facade ID must be a valid UUID",
  }),
}).messages({
  "object.unknown": "Only specified fields are allowed during lead creation",
});

export const createPublicLeadSchema = Joi.object({
  builder_id: Joi.string().uuid().required().messages({
    "string.guid": "Builder ID must be a valid UUID",
    "any.required": "Builder ID is required",
  }),
  company_id: Joi.string().uuid().required().allow(null).messages({
    "string.guid": "Company ID must be a valid UUID",
  }),
  name: Joi.string().min(2).max(255).required().messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name must not exceed 255 characters",
    "any.required": "Name is required",
  }),
  email: Joi.string().email().max(255).required().allow(null, "").messages({
    "string.email": "Please provide a valid email address",
    "string.max": "Email must not exceed 255 characters",
  }),
  phone: phoneRule,
  notes: Joi.string().max(1000).optional().allow(null, "").messages({
    "string.max": "Notes must not exceed 1000 characters",
  }),
  featur_facade_id: Joi.string().uuid().required().allow(null).messages({
    "string.guid": "Facade ID must be a valid UUID",
  }),
}).messages({
  "object.unknown": "Only specified fields are allowed during lead creation",
});

export const getLeadByIdSchema = Joi.object({
  leads_id: Joi.string().uuid().required().messages({
    "string.guid": "Lead ID must be a valid UUID",
    "any.required": "Lead ID is required",
  }),
});

export const updateLeadSchema = Joi.object({
  reference_number: Joi.string().max(30).optional(),

  name: Joi.string().min(2).max(255).optional().messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name must not exceed 255 characters",
  }),
  email: Joi.string().email().max(255).optional().messages({
    "string.email": "Please provide a valid email address",
    "string.max": "Email must not exceed 255 characters",
  }),
  phone: phoneRule,
  notes: Joi.string().max(1000).optional().allow(null, "").messages({
    "string.max": "Notes must not exceed 1000 characters",
  }),
  send_letter: Joi.boolean().optional(),
  lead_source_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Lead source ID must be a valid UUID",
  }),
  house_land_package_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "House Land Package ID must be a valid UUID",
  }),

  status: Joi.string()
    .valid("New", "Working", "Convert")
    .optional()
    .messages({
      "any.only": "Status must be one of: New, Working, Convert",
    }),

  rating: Joi.string()
    .valid("Hot", "Warm", "Cold", "None")
    .optional()
    .allow(null)
    .messages({
      "any.only": "Rating must be one of: Hot, Warm, Cold, None",
    }),
  land: Joi.string()
    .valid("None", "No", "Yes")
    .optional()
    .allow(null)
    .messages({
      "any.only": "Land must be one of: None, No, Yes",
    }),
  finance: Joi.string()
    .valid("None", "No", "Yes")
    .optional()
    .allow(null)
    .messages({
      "any.only": "Finance must be one of: None, No, Yes",
    }),
  face_to_face: Joi.string()
    .valid("None", "Yes", "No")
    .optional()
    .allow(null)
    .messages({
      "any.only": "Face to face must be one of: None, Yes, No",
    }),
  purpose: Joi.string()
    .valid("None", "Own House", "Investment Property")
    .optional()
    .allow(null)
    .messages({
      "any.only":
        "Purpose must be one of: None, Own House, Investment Property",
    }),
  client_type_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Client type ID must be a valid UUID",
  }),
  forcast_close: Joi.date().optional().allow(null).messages({
    "date.base": "Forecast close date must be a valid date",
  }),
  build_budget: Joi.number().precision(2).optional().allow(null).messages({
    "number.base": "Build budget must be a number",
    "number.precision": "Build budget can have maximum 2 decimal places",
  }),
  region_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Region ID must be a valid UUID",
  }),
  prelim_agreement: Joi.date().optional().allow(null).messages({
    "date.base": "Preliminary agreement date must be a valid date",
  }),
  client_profile: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "Client profile must not exceed 500 characters",
  }),
  h_l_budget: Joi.number().precision(2).optional().allow(null).messages({
    "number.base": "H&L budget must be a number",
    "number.precision": "H&L budget can have maximum 2 decimal places",
  }),
  assignee_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Assignee ID must be a valid UUID",
  }),
  facade_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Facade ID must be a valid UUID",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });

export const updateLeadStatusSchema = Joi.object({
  status: Joi.string()
    .valid("New", "Working", "Convert")
    .required()
    .messages({
      "any.only": "Status must be one of: New, Working, Convert",
      "any.required": "Status is required",
    }),
});

export const assignLeadSchema = Joi.object({
  assignee_id: Joi.string().uuid().required().messages({
    "string.guid": "Assignee ID must be a valid UUID",
    "any.required": "Assignee ID is required",
  }),
  assignee_note: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "Assignee note must not exceed 500 characters",
  }),
});

export const getAllLeadsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(500).default(25).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 500",
  }),
  status: Joi.string()
    .valid("New", "Working", "Convert", "Proposal", "Negotiation", "Closed")
    .optional(),

  rating: Joi.alternatives()
    .try(
      Joi.string().valid("Hot", "Warm", "Cold", "None"),
      Joi.string().pattern(/^(Hot|Warm|Cold|None)(,(Hot|Warm|Cold|None))*$/),
    )
    .optional(),
  lead_source_id: Joi.alternatives()
    .try(Joi.string().uuid(), Joi.string().pattern(/^[0-9a-fA-F-]+(,[0-9a-fA-F-]+)*$/))
    .optional(),
  client_type_id: Joi.string().uuid().optional(),
  region_id: Joi.string().uuid().optional(),
  assignee_id: Joi.alternatives()
    .try(Joi.string().uuid(), Joi.string().pattern(/^[0-9a-fA-F-]+(,[0-9a-fA-F-]+)*$/))
    .optional(),
  search: Joi.string().max(100).optional().messages({
    "string.max": "Search term must not exceed 100 characters",
  }),
  created_at: Joi.string()
    .valid(
      "last_15_minutes",
      "last_1_hour",
      "last_2_hours",
      "last_24_hours",
      "today",
      "yesterday",
      "last_7_days",
      "last_15_days",
      "last_30_days",
    )
    .optional(),
  sort_by: Joi.string().valid("created_at").optional(),
  sort_order: Joi.string().valid("asc", "desc").optional(),
});

export const convertLeadToOpportunitySchema = Joi.object({
  opportunity_notes: Joi.string().max(1000).optional().allow(null, "").messages({
    "string.max": "Opportunity notes must not exceed 1000 characters",
  }),
});

export const removeHLPackageSchema = Joi.object({
  remove_hl_package_lot_quotation: Joi.boolean().optional().default(true).messages({
    "boolean.base": "remove_hl_package_lot_quotation must be a boolean",
  }),
});

export const getLeadActivityLogQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(500).default(25).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 500",
  }),
  module: Joi.string().max(255).optional().messages({
    "string.max": "Module must not exceed 255 characters",
  }),
  action: Joi.string().max(255).optional().messages({
    "string.max": "Action must not exceed 255 characters",
  }),
  search: Joi.string().max(255).optional().messages({
    "string.max": "Search must not exceed 255 characters",
  }),
  // all = return the entire timeline in one response (no pagination). When
  // true, page/limit are ignored. Mirrors the job activity-log endpoint.
  all: Joi.boolean().default(false).messages({
    "boolean.base": "All must be a boolean",
  }),
});

export default {
  createLeadSchema,
  getLeadByIdSchema,
  updateLeadSchema,
  updateLeadStatusSchema,
  assignLeadSchema,
  getAllLeadsQuerySchema,
  convertLeadToOpportunitySchema,
  removeHLPackageSchema,
  getLeadActivityLogQuerySchema,
  createPublicLeadSchema,
};
