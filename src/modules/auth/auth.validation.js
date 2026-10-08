import Joi from "joi";

// Reusable rules
const nameRule = Joi.string().min(2).max(100).trim().required().messages({
  "string.base": "Name must be a string",
  "string.empty": "Name is required",
  "string.min": "Name must be at least 2 characters long",
  "string.max": "Name must not exceed 100 characters",
  "any.required": "Name is required",
});

const emailRule = Joi.string().email().lowercase().trim().required().messages({
  "string.base": "Email must be a string",
  "string.empty": "Email is required",
  "string.email": "Please provide a valid email address",
  "any.required": "Email is required",
});

const passwordRule = Joi.string().min(6).max(100).required().messages({
  "string.base": "Password must be a string",
  "string.empty": "Password is required",
  "string.min": "Password must be at least 6 characters long",
  "string.max": "Password must not exceed 100 characters",
  "any.required": "Password is required",
});

const otpRule = Joi.string()
  .length(6)
  .pattern(/^[0-9]+$/)
  .required()
  .messages({
    "string.base": "OTP must be a string",
    "string.empty": "OTP is required",
    "string.length": "OTP must be exactly 6 digits",
    "string.pattern.base": "OTP must contain only numbers",
    "any.required": "OTP is required",
  });

const phoneRule = Joi.string()
  .pattern(/^[0-9]{10,15}$/)
  .optional()
  .allow("")
  .messages({
    "string.base": "Phone must be a string",
    "string.pattern.base":
      "Phone must contain only digits and be 10-15 characters long",
  });

// Schemas
export const registerRootSchema = Joi.object({
  name: nameRule,
  email: emailRule,
  password: passwordRule,
  role_id: Joi.string().uuid().required().messages({
    "string.guid": "role ID must be a valid UUID",
    "any.required": "role ID is required",
  }),
  phone: phoneRule,
});

export const loginUserSchema = Joi.object({
  email: Joi.string().trim().optional().allow("").messages({
    "string.base": "Email/Login ID must be a string",
  }),
  login_id: Joi.string().min(2).max(100).trim().optional().allow("").messages({
    "string.base": "Login ID must be a string",
    "string.min": "Login ID must be at least 2 characters long",
    "string.max": "Login ID must not exceed 100 characters",
  }),
  // Password is optional at the validation layer so the service can return a
  // provider-specific message (e.g. "registered with Google — set a password
  // first") for OAuth accounts that have no local password yet. Accounts that
  // do have a password still get a "Password is required" error from the service.
  password: Joi.string().allow("").optional().messages({
    "string.base": "Password must be a string",
  }),
})
  .or("email", "login_id")
  .messages({
    "object.missing": "Either email or login ID is required",
  });

export const verifyEmailSchema = Joi.object({
  email: emailRule,
  otp: otpRule,
});

export const forgotPasswordSchema = Joi.object({
  email: emailRule,
});

export const resetPasswordSchema = Joi.object({
  email: emailRule,
  resetPasswordToken: Joi.string().allow("").messages({
    "string.base": "Reset password token must be a string",
    "string.empty": "Reset password token is not empty",
    "any.required": "Reset password token is required",
  }),
  password: passwordRule.label("New password"), // override label for better messages
});

export const requestSetPasswordLinkSchema = Joi.object({
  email: emailRule,
});

export const setPasswordSchema = Joi.object({
  email: emailRule,
  token: Joi.string().required().messages({
    "string.base": "Token must be a string",
    "string.empty": "Token is required",
    "any.required": "Token is required",
  }),
  password: passwordRule.label("Password"),
  confirmPassword: Joi.string().required().valid(Joi.ref("password")).messages({
    "any.only": "Passwords do not match",
    "string.empty": "Confirm password is required",
    "any.required": "Confirm password is required",
  }),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    "string.base": "Current password must be a string",
    "string.empty": "Current password is required",
    "any.required": "Current password is required",
  }),
  newPassword: passwordRule.label("New password"),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    "string.base": "Refresh token must be a string",
    "string.empty": "Refresh token is required",
    "any.required": "Refresh token is required",
  }),
});

export const resendOtpSchema = Joi.object({
  email: emailRule,
});

export default {
  registerRootSchema,
  loginUserSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  requestSetPasswordLinkSchema,
  setPasswordSchema,
  changePasswordSchema,
  refreshTokenSchema,
  resendOtpSchema,
};
