import express from "express";
import passport from "passport";
import { env } from "../../config/env.config.js";

const router = express.Router();

import {
  registerRoot,
  verifyEmail,
  resendOtp,
  login,
  forgotPassword,
  resetPassword,
  requestSetPasswordLink,
  setPassword,
  refreshToken,
  logout,
  googleCallback,
  me,
} from "./auth.controller.js";
import { scopeBuilder } from "../../middleware/rbac/index.js";
import {
  registerRootSchema,
  verifyEmailSchema,
  resendOtpSchema,
  loginUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  requestSetPasswordLinkSchema,
  setPasswordSchema,
  refreshTokenSchema,
} from "./auth.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";

// AUTH ROUTES
router.post(
  "/register", camelToSnakeMiddleware,
  validateRequest(registerRootSchema, REQUEST_SOURCE.BODY),
  registerRoot,
);

router.post(
  "/verify-email", camelToSnakeMiddleware,
  validateRequest(verifyEmailSchema, REQUEST_SOURCE.BODY),
  verifyEmail,
);

router.post(
  "/resend-otp", camelToSnakeMiddleware,
  validateRequest(resendOtpSchema, REQUEST_SOURCE.BODY),
  resendOtp,
);

router.post(
  "/login", camelToSnakeMiddleware,
  validateRequest(loginUserSchema, REQUEST_SOURCE.BODY),
  login,
);

router.post(
  "/forgot-password", camelToSnakeMiddleware,
  validateRequest(forgotPasswordSchema, REQUEST_SOURCE.BODY),
  forgotPassword,
);

router.post(
  "/reset-password",
  validateRequest(resetPasswordSchema, REQUEST_SOURCE.BODY),
  resetPassword,
);

router.post(
  "/set-password/request",
  validateRequest(requestSetPasswordLinkSchema, REQUEST_SOURCE.BODY),
  requestSetPasswordLink,
);

router.post(
  "/set-password",
  validateRequest(setPasswordSchema, REQUEST_SOURCE.BODY),
  setPassword,
);

router.post(
  "/refresh-token",
  validateRequest(refreshTokenSchema, REQUEST_SOURCE.BODY),
  refreshToken,
);

router.post("/logout", authMiddleware, roleMiddleware, logout);

// Google OAuth routes
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account", session: false })
);

router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", { session: false }, (err, user, info) => {
    if (err || !user) {
      const reason = info?.message || err?.message || "Authentication failed";
      return res.redirect(
        `${env.EMAIL.FRONTEND_BASE_URL}/auth/sign-in?error=${encodeURIComponent(reason)}`,
      );
    }
    req.user = user;
    return googleCallback(req, res);
  })(req, res, next);
});
// Current user + effective RBAC permissions. The frontend calls this on
// boot to decide which menus / actions to render.
router.get("/me", authMiddleware, scopeBuilder, me);

export default router;
