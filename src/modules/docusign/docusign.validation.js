import Joi from "joi";

// UUID validation pattern
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Send quotation for e-signature - params
export const sendQuotationEsignSchema = Joi.object({
  quotationVersionId: Joi.string().pattern(uuidPattern).required().messages({
    "string.pattern.base": "Invalid quotation version ID format",
    "any.required": "Quotation version ID is required",
  }),
});

// Send quotation for e-signature - body
export const sendQuotationEsignBodySchema = Joi.object({
  signers: Joi.array()
    .items(
      Joi.object({
        email: Joi.string().email().required(),
        name: Joi.string().min(2).max(100).required(),
        routingOrder: Joi.string().default("1"),
        clientUserId: Joi.string().optional(), // Provide if using embedded signing
      }),
    )
    .min(1)
    .required()
    .messages({
      "array.min": "At least one signer is required",
      "any.required": "Signers array is required",
    }),
  ccRecipients: Joi.array()
    .items(
      Joi.object({
        email: Joi.string().email().required(),
        name: Joi.string().min(2).max(100).required(),
        routingOrder: Joi.string().default("2"), // Default CCs to receive after signers
      }),
    )
    .optional(),
  emailSubject: Joi.string().max(255).optional(),
  emailBlurb: Joi.string().max(2000).optional(),
  useEmbeddedSigning: Joi.boolean().default(false),
});

// Get signing URL - query (UPDATED FOR DYNAMIC SIGNERS)
export const getSigningUrlSchema = Joi.object({
  returnUrl: Joi.string().uri().optional().messages({
    "string.uri": "Return URL must be a valid URI",
  }),
  signerEmail: Joi.string().email().required().messages({
    "any.required": "Signer email is required to generate their unique link"
  }),
  signerName: Joi.string().required().messages({
    "any.required": "Signer name is required"
  })
});

export const cancelEsignSchema = Joi.object({
  voidReason: Joi.string().max(255).required()
});

// Get envelope status - params
export const getEnvelopeStatusSchema = Joi.object({
  envelopeId: Joi.string().pattern(uuidPattern).required().messages({
    "string.pattern.base": "Invalid envelope ID format",
    "any.required": "Envelope ID is required",
  }),
});

// Get quotation e-signature status - params
export const getQuotationEsignStatusSchema = Joi.object({
  quotationVersionId: Joi.string().pattern(uuidPattern).required().messages({
    "string.pattern.base": "Invalid quotation version ID format",
    "any.required": "Quotation version ID is required",
  }),
});

// Download signed document - params
export const downloadSignedDocumentSchema = Joi.object({
  envelopeId: Joi.string().pattern(uuidPattern).required().messages({
    "string.pattern.base": "Invalid envelope ID format",
    "any.required": "Envelope ID is required",
  }),
});

// Resend e-signature request - params
export const resendEsignRequestSchema = Joi.object({
  quotationVersionId: Joi.string().pattern(uuidPattern).required().messages({
    "string.pattern.base": "Invalid quotation version ID format",
    "any.required": "Quotation version ID is required",
  }),
});