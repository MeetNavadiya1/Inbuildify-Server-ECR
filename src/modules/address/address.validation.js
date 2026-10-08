import Joi from "joi";
import { SUPPORTED_POSTCODE_MESSAGE, SUPPORTED_POSTCODE_PATTERN } from "../city/city.data.js";
import { ADDRESS_PATTERN, ADDRESS_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createAddressSchema = Joi.object({
  country_id: Joi.string().uuid().allow(null).optional(),
  state_id: Joi.string().uuid().allow(null).optional(),
  address_line1: Joi.string()
    .min(2)
    .max(255)
    .pattern(ADDRESS_PATTERN)
    .required()
    .messages({
      "any.required": "Address Line 1 is required",
    }),

  address_line2: Joi.string()
    .min(2)
    .max(255)
    .pattern(ADDRESS_PATTERN)
    .allow(null, "")
    .optional(),
  city: Joi.string().max(100).allow(null, "").optional(),
  // Digits only here; the exact rule for the address's country and state is checked on save (locationGuard).
  zip_code: Joi.string()
    .optional()
    .pattern(SUPPORTED_POSTCODE_PATTERN)
    .messages({ "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE }),
});

export default { createAddressSchema };
