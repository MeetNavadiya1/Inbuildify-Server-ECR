import AuthService from "./auth.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { env } from "../../config/env.config.js";
import { getEffectivePermissions } from "../../helper/rbac.helper.js";
import { getRoleScope, getRoleTier } from "../../constants/rbac.js";

export async function registerRoot(req, res) {
  try {
    const data = await AuthService.registerRoot(req.body);
    return successResponse(res, data, "Root user registered. OTP sent.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function verifyEmail(req, res) {
  try {
    // Returns a session (same shape as login) so the frontend can move straight
    // into onboarding instead of sending the user back to the login screen.
    const data = await AuthService.verifyEmail(req.body);
    return successResponse(res, data, "Email verified successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function resendOtp(req, res) {
  try {
    const data = await AuthService.resendOtp(req.body.email);
    return successResponse(res, data, "A new verification code has been sent. It is valid for 10 minutes.");
  } catch (err) {
    // Throttled: tell the client how long to wait so it can show a countdown.
    if (err?.statusCode === 429 && err?.code) {
      res.set("Retry-After", String(err.retryAfterSeconds));
      return errorResponse(res, 429, err.message, {
        code: err.code,
        retryAfterSeconds: err.retryAfterSeconds,
      });
    }
    return handleControllerError(res, err, err.message);
  }
}

export async function login(req, res) {
  try {
    const data = await AuthService.login(req.body);
    // Google/OAuth account with no local password yet — a set-password link was
    // emailed. Return success with the flag so the frontend shows "check your email".
    if (data?.requirePasswordSetup) {
      return successResponse(res, { requirePasswordSetup: true }, data.message);
    }
    return successResponse(res, data, "Login successful.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function forgotPassword(req, res) {
  try {
    await AuthService.forgotPassword(req.body.email);
    return successResponse(res, null, "Password reset email sent.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function resetPassword(req, res) {
  try {
    await AuthService.resetPassword(req.body);
    return successResponse(res, null, "Password reset successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function requestSetPasswordLink(req, res) {
  try {
    const data = await AuthService.requestSetPasswordLink(req.body.email);
    return successResponse(res, data, "A set-password link has been sent to your email.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function setPassword(req, res) {
  try {
    const data = await AuthService.setPassword(
      req.body.email,
      req.body.token,
      req.body.password,
    );
    return successResponse(
      res,
      data,
      "Password set successfully. You can now log in with email and password.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function refreshToken(req, res) {
  try {
    const data = await AuthService.refreshToken(req.body.refreshToken);
    return successResponse(res, data, "Access token refreshed.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function logout(req, res) {
  try {
    await AuthService.logout(req.user);
    return successResponse(res, null, "Logged out successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function googleCallback(req, res) {
  try {
    if (!req.user) {
      return res.redirect(
        `${env.EMAIL.FRONTEND_BASE_URL}/auth/sign-in?error=Authentication%20failed`,
      );
    }

    const tokens = await AuthService.handleGoogleCallback(req.user);

    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

    return res.redirect(`${env.EMAIL.FRONTEND_BASE_URL}/auth/sign-in?${params.toString()}`);
  } catch (err) {
    return res.redirect(
      `${env.EMAIL.FRONTEND_BASE_URL}/auth/sign-in?error=${encodeURIComponent(err.message || "Internal server error")}`,
    );
  }
}
/**
 * /auth/me — return the requester's identity plus the effective RBAC
 * permission map (Section 4 matrix flattened for the current role) and tier
 * / scope metadata so the frontend can hide menus without a second roundtrip.
 *
 * Requires authMiddleware + scopeBuilder upstream so req.user.role_name and
 * req.scope are populated.
 */
export async function me(req, res) {
  try {
    const roleName = req.user?.role_name || req.scope?.roleName;
    if (!roleName) {
      return errorResponse(res, 403, "Forbidden: role not resolved");
    }
    // P2: getEffectivePermissions is now async and DB-backed (company override
    // > global default > static matrix). Pass the full user so it can resolve
    // by role_id + company_id for the correct per-company permissions.
    const permissions = await getEffectivePermissions(req.user);
    return successResponse(
      res,
      {
        user: {
          users_id: req.user.users_id,
          name: req.user.name,
          email: req.user.email,
          login_id: req.user.login_id,
          role_id: req.user.role_id,
          role_name: roleName,
          tier: getRoleTier(roleName),
          scope: getRoleScope(roleName),
          company_id: req.user.company_id || null,
          builder_id: req.user.builder_id || null,
        },
        permissions,
      },
      "Current user fetched",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export default {
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
};
