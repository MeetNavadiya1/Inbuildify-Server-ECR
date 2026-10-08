import Joi from "joi";

export const convertOpportunitySchema = {
  params: Joi.object({
    opportunity_id: Joi.string().uuid().required().messages({
     "string.guid": "Please select a valid opportunity.",
      "any.required": "Please select an opportunity.",
    }),
  }),
  body: Joi.object({
    out_come: Joi.string().valid("won", "lost").required().messages({
      "any.only": "Outcome must be 'won' or 'lost'",
      "any.required": "Outcome is required",
    }),
    quotation_version_id: Joi.string()
      .uuid()
      .when("out_come", {
        is: "won",
        then: Joi.required().messages({
          "any.required": "Quotation version ID is required when status is WON",
          "string.guid": "Quotation version ID must be a valid UUID",
        }),
        otherwise: Joi.forbidden(),
      }),
    job_note: Joi.string().max(1000).when("out_come", {
      is: "won",
      then: Joi.optional().allow(null, ""),
      otherwise: Joi.forbidden(),
    }).messages({
      "string.max": "Job note must not exceed 1000 characters",
    }),
    send_email: Joi.boolean()
      .when("out_come", {
        is: "won",
        then: Joi.optional().default(false),
        otherwise: Joi.forbidden(),
      }),
    lead_lost_reason_id: Joi.string()
      .uuid()
      .when("out_come", {
        is: "lost",
        then: Joi.required().messages({
          "any.required": "Lead lost reason ID is required when status is LOST",
          "string.guid": "Lead lost reason ID must be a valid UUID",
        }),
        otherwise: Joi.forbidden(),
      }),
    lead_lost_comment: Joi.string()
      .max(1000)
      .when("out_come", {
        is: "lost",
        then: Joi.optional().allow(null, ""),
        otherwise: Joi.forbidden(),
      })
      .messages({
        "string.max": "Lead lost comment must not exceed 1000 characters",
      }),
  }),
};

// Slide-over "Commencement Letter" modal: the user selects recipient(s) in the
// "To" field, an optional CC, a subject, and an HTML message. The Job PDF is
// generated and attached server-side.
export const commencementLetterParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "Job ID must be a valid UUID",
    "any.required": "Job ID is required",
  }),
});

export const sendCommencementLetterBodySchema = Joi.object({
  to: Joi.array()
    .items(Joi.string().email().messages({ "string.email": "Each recipient must be a valid email address" }))
    .min(1)
    .required()
    .messages({
      "array.base": "To must be an array of email addresses",
      "array.min": "At least one recipient is required",
      "any.required": "At least one recipient is required",
    }),
  cc: Joi.array()
    .items(Joi.string().email().messages({ "string.email": "Each CC must be a valid email address" }))
    .optional()
    .default([]),
  subject: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Subject is required",
    "any.required": "Subject is required",
    "string.max": "Subject must not exceed 255 characters",
  }),
  message: Joi.string().trim().optional().allow(null, "").messages({
    "string.base": "Message must be a string",
  }),
  // When true, the sender (logged-in user) is CC'd a copy of the letter.
  emailCopy: Joi.boolean().optional().default(false),
});

// Public acknowledgment from the customer (via /external). The recipient either
// accepts or declines the Commencement notice, with optional comments and a
// "email me a copy" toggle.
export const acknowledgeCommencementLetterBodySchema = Joi.object({
  decision: Joi.string().valid("ACCEPTED", "DECLINED").required().messages({
    "any.only": "Decision must be ACCEPTED or DECLINED",
    "any.required": "Decision is required",
  }),
  comments: Joi.string().trim().max(500).required().allow(null, "").messages({
    "string.max": "Comments must not exceed 500 characters",
  }),
  emailCopy: Joi.boolean().optional().default(false),
});

// "Complete Job" approval: the Confirmation drawer nominates one Company
// Administrator / Site Supervisor; the handover dates travel with the request
// so they can be printed on the approval PDF.
export const completionApprovalParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "Job ID must be a valid UUID",
    "any.required": "Job ID is required",
  }),
});

export const sendCompletionApprovalBodySchema = Joi.object({
  approver_user_id: Joi.string().uuid().required().messages({
    "string.guid": "Approver must be a valid user",
    "any.required": "Please select an approver",
  }),
  pci_date: Joi.string().trim().optional().allow(null, ""),
  occupancy_permit_date: Joi.string().trim().optional().allow(null, ""),
  handover_date: Joi.string().trim().required().messages({
    "string.empty": "Handover date is required",
    "any.required": "Handover date is required",
  }),
});

// Public accept/decline from the approver (via /external).
export const respondCompletionApprovalBodySchema = Joi.object({
  decision: Joi.string().valid("ACCEPTED", "DECLINED").required().messages({
    "any.only": "Decision must be ACCEPTED or DECLINED",
    "any.required": "Decision is required",
  }),
  comments: Joi.string().trim().max(500).optional().allow(null, "").messages({
    "string.max": "Comments must not exceed 500 characters",
  }),
  emailCopy: Joi.boolean().optional().default(false),
});

// PATCH /job/:job_id/builder — reassign the builder firm that owns the job.
export const assignBuilderParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "Job ID must be a valid UUID",
    "any.required": "Job ID is required",
  }),
});

// The picker lists builders from the builder table; the chosen builder_id is
// stored on the job.
export const assignBuilderBodySchema = Joi.object({
  builder_id: Joi.string().uuid().required().messages({
    "string.guid": "Builder ID must be a valid UUID",
    "any.required": "Builder ID is required",
  }),
});

// Params for GET /job/my/tracking/:job_id — the Contact build tracker.
export const myJobTrackingParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "Job ID must be a valid UUID",
    "any.required": "Job ID is required",
  }),
});

/**
 * Body for PUT /job/my/tracking/:job_id/colours — the homebuyer's picks.
 *
 * Validated after camelToSnakeMiddleware, so the keys are snake_cased here.
 * A trimmed version of what the internal colour screen may send: `pdf_highlight`
 * is deliberately absent, since how an item renders in the builder's colour PDF
 * is not the customer's to set. An empty item_ids array is valid — that is how
 * "I deselected everything" arrives.
 */
export const myJobColourSaveSchema = Joi.object({
  item_ids: Joi.array().items(Joi.string().uuid()).messages({
    "string.guid": "Each selected colour must be a valid item",
  }),
  selections: Joi.array().items(
    Joi.object({
      color_id: Joi.string().uuid(),
      color_item_id: Joi.string().uuid(),
      // Sent as a string by the customer screen, so let Joi coerce it; "" and
      // null both mean "leave the stored quantity alone".
      unit: Joi.number().min(0).max(9999).allow(null, "").messages({
        "number.base": "Quantity must be a number",
        "number.min": "Quantity must be at least 0",
        "number.max": "Quantity must not exceed 9999",
      }),
      note: Joi.string().allow(null, "").max(1000).messages({
        "string.max": "Note must not exceed 1000 characters",
      }),
    }).or("color_id", "color_item_id"),
  ),
})
  .or("item_ids", "selections")
  .messages({
    "object.missing": "Send the colours you have chosen as itemIds or selections",
  });

export const getJobActivityLogParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "Job ID must be a valid UUID",
    "any.required": "Job ID is required",
  }),
});

export const getJobActivityLogQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(100).default(20).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),
  module: Joi.string().max(255).optional().allow("", null).messages({
    "string.max": "Module must not exceed 255 characters",
  }),
  action: Joi.string().max(255).optional().allow("", null).messages({
    "string.max": "Action must not exceed 255 characters",
  }),
  search: Joi.string().max(255).optional().allow("", null).messages({
    "string.max": "Search must not exceed 255 characters",
  }),
  // When true, return the full activity trail (no pagination).
  all: Joi.boolean().optional().messages({
    "boolean.base": "All must be a boolean",
  }),
});

/**
 * PUT /job/my/tracking/colours — the homebuyer replacing their own picks.
 *
 * Keys are snake_case because camelToSnakeMiddleware runs first: the client
 * sends `itemIds` / `colorId`, which arrive here as `item_ids` / `color_id`.
 *
 * Tighter than the builder-side save on purpose. This body comes from a
 * customer's browser, so it is an allow-list of exactly the two things they can
 * decide — which items, and how many of a per-unit one. `note` and
 * `pdfHighlight` are the consultant's fields and Joi rejects unknown keys by
 * default, so sending either is refused rather than quietly ignored.
 *
 * The ids must be UUIDs here and not merely downstream: the service checks them
 * against the job with an `IN (…)` , and a non-UUID string would reach Postgres
 * as a failed cast rather than a readable "that isn't your item".
 */
export const myColoursBodySchema = Joi.object({
  item_ids: Joi.array()
    .items(Joi.string().uuid().messages({ "string.guid": "Colour selections must be valid items" }))
    .max(500)
    .default([])
    .messages({ "array.max": "A colour schedule cannot hold more than 500 items" }),
  selections: Joi.array()
    .items(
      Joi.object({
        color_id: Joi.string().uuid().required().messages({
          "string.guid": "Colour selections must be valid items",
          "any.required": "Each selection must name a colour item",
        }),
        // The quantity for a mandatory-unit item. Arrives as the string the
        // number input produced, so digits are matched rather than assuming a
        // JSON number; "" is how the client says "cleared".
        unit: Joi.string()
          .pattern(/^\d{1,4}(\.\d{1,2})?$/)
          .allow("", null)
          .optional()
          .messages({ "string.pattern.base": "Quantity must be a positive number" }),
      }),
    )
    .max(500)
    .default([])
    .messages({ "array.max": "A colour schedule cannot hold more than 500 items" }),
});

export default {
  convertOpportunitySchema,
  myColoursBodySchema,
  commencementLetterParamsSchema,
  sendCommencementLetterBodySchema,
  acknowledgeCommencementLetterBodySchema,
  completionApprovalParamsSchema,
  sendCompletionApprovalBodySchema,
  respondCompletionApprovalBodySchema,
  assignBuilderParamsSchema,
  assignBuilderBodySchema,
  getJobActivityLogParamsSchema,
  getJobActivityLogQuerySchema,
};
