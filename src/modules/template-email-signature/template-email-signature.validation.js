import Joi from "joi";

export const createTemplateEmailSignatureSchema = Joi.object({
  include_email_signature: Joi.boolean().default(false),
  signature_content: Joi.alternatives().conditional("include_email_signature", {
    otherwise: Joi.forbidden().messages({
      "any.unknown":
        "Signature content is not allowed when include_email_signature is false.",
    }),
  }),
});

export const updateTemplateEmailSignatureSchema = Joi.object({
  include_email_signature: Joi.boolean().optional(),
  signature_content: Joi.alternatives().try(
    Joi.string().allow(null, "").optional(),
    Joi.valid(null),
  ),
}).custom((value, helpers) => {
  if (value.include_email_signature === false && value.signature_content) {
    return helpers.error(
      "any.custom",
      "signature_content must be null or empty when include_email_signature is false",
    );
  }
  return value;
}, "Custom logic validation");

export default {
  createTemplateEmailSignatureSchema,
  updateTemplateEmailSignatureSchema,
};
