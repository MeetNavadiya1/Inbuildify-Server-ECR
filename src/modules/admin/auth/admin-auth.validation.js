import Joi from "joi";

export const adminLoginSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    "any.required": "email is required.",
    "string.email": "email must be a valid email address.",
  }),
  password: Joi.string().min(6).max(128).required().messages({
    "any.required": "password is required.",
    "string.min": "password must be at least 6 characters.",
  }),
});

export default { adminLoginSchema };
