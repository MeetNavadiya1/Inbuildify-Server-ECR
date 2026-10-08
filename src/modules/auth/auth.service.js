import crypto from "crypto";
import { env } from "../../config/env.config.js";
import jwt from "jsonwebtoken";

import sendEmail from "../../service/sendMail.service.js";
import { wrapAuthEmailHTML } from "../../templates/auth-email.template.js";
import { upsertCompanyService } from "../company/company.service.js";
import { seedBuilderDefaults } from "../../seeder/seed-builder-defaults.js";
import { generateAccessToken, generateRefreshToken, decrypt as base64Decrypt } from "../../utils/common.js";
import { seedCompanyRbac } from "../../seeder/seed-company-rbac.js";
import { encrypt, decrypt } from "../../utils/crypto.util.js";
import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import {
  sendVerificationCode,
  sendInitialVerificationCode,
  throwIfAwaitingVerification,
} from "./email-verification.service.js";

// REGISTER ROOT USER
export async function registerRoot({ name, email, password, role_id }) {
  const lowerEmail = email.toLowerCase();
  const { Users, Builder, Role, sequelize } = db;
  // Check if root already exists
  const existingUser = await Users.findOne({
    where: {
      email: sequelize.where(
        sequelize.fn("LOWER", sequelize.col("email")),
        lowerEmail,
      ),
    },
  });
  if (existingUser) {
    throwIfAwaitingVerification(existingUser);
    throw { statusCode: 409, message: "User already exists." };
  }

  // Check if role exists
  const roleExists = await Role.findByPk(role_id);
  if (!roleExists) {
    throw { statusCode: 400, message: "Invalid role." };
  }

  const result = await sequelize.transaction(async (t) => {
    // Create builder
    const builder = await Builder.create(
      { name, email: lowerEmail },
      { transaction: t },
    );
    const builder_id = builder.builder_id;

    // Create root user
    const user = await Users.create(
      {
        builder_id,
        name,
        email: lowerEmail,
        role_id,
        password: encrypt(password),
        root_user: true,
      },
      { transaction: t },
    );
    const users_id = user.users_id;

    // Create default company for the new builder
    const defaultCompanyPayload = {
      name: `${name}`,
      abn_number: null,
      timezone_id: null,
      address: null,
      bank_name: null,
      account_name: null,
      account_number: null,
      account_bsb: null,
      email_signature_logo: null,
      company_logo: null,
    };

    // upsertCompanyService now accepts a Sequelize transaction — pass t
    const companyResult = await upsertCompanyService({ builderId: builder_id }, defaultCompanyPayload, t);
    const company_id = companyResult?.companyId || null;

    if (company_id) {
      await user.update({ company_id }, { transaction: t });
    }

    // Seed all default settings
    await seedBuilderDefaults({
      company_id,
      builder_id,
      created_by: users_id,
      transaction: t, // Use the Sequelize transaction
    });

    // Provision per-company RBAC roles + permissions
    const roleIdMapping = await seedCompanyRbac({
      company_id,
      builder_id,
      created_by: users_id,
      transaction: t,
    });

    const companyAdminRoleId = roleIdMapping && roleIdMapping.get(role_id);
    if (companyAdminRoleId) {
      await user.update({ role_id: companyAdminRoleId }, { transaction: t });
    }

    return { email: lowerEmail, usersId: users_id };
  });

  // Send OTP email OUTSIDE transaction (side effect, non-rollbackable)
  const verificationEmailSent = await sendInitialVerificationCode(result.usersId, lowerEmail);

  return { email: result.email, verificationEmailSent };
}
// VERIFY EMAIL
/**
 * Mint a session for an already-authenticated user and report where the
 * frontend should land them.
 *
 * Mirrors the tail of login() — kept as a helper because verifyEmail() has to
 * hand back exactly the same shape: the user goes straight from the OTP screen
 * into /onboarding, which is a protected route, so a session must exist by then.
 */
async function issueUserSession(user) {
  const { UsersToken, Company, Builder } = db;

  const accessToken = generateAccessToken(user.users_id);
  const refreshToken = generateRefreshToken(user.users_id);

  await UsersToken.create({
    user_id: user.users_id,
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // The frontend reads isOnboardingFinished to decide between the dashboard and
  // the onboarding wizard. Company Administrators sit under company_id directly;
  // sub-users sit under builder_id and inherit the company via Builder.
  let company = null;
  if (user.company_id) {
    company = await Company.findByPk(user.company_id, {
      attributes: ["company_id", "is_onboarding_finished"],
    });
  } else if (user.builder_id) {
    const builder = await Builder.findByPk(user.builder_id, { attributes: ["company_id"] });
    if (builder?.company_id) {
      company = await Company.findByPk(builder.company_id, {
        attributes: ["company_id", "is_onboarding_finished"],
      });
    }
  }

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.users_id,
      email: user.email,
      role_id: user.role_id,
      auth_provider: user.auth_provider,
      hasPassword: !!user.password,
    },
    companyId: company?.company_id || null,
    isOnboardingFinished: company ? !!company.is_onboarding_finished : false,
  };
}

/**
 * The account an email-verification request is about, or a thrown error for
 * anything that must not verify / be sent a code: unknown, deleted or
 * sample-data rows (not real mailboxes), and accounts login would refuse anyway.
 */
async function findAccountAwaitingVerification(lowerEmail, options = {}) {
  const { Users, sequelize } = db;

  const user = await Users.findOne({
    ...options,
    where: {
      [Op.and]: [
        sequelize.where(sequelize.fn("LOWER", sequelize.col("email")), lowerEmail),
        { is_deleted: false },
      ],
    },
  });

  if (!user || user.is_sample_data) {
    throw { statusCode: 404, message: "User not found." };
  }
  if (user.is_verified) {
    throw { statusCode: 400, code: "EMAIL_ALREADY_VERIFIED", message: "Email already verified. Please sign in." };
  }
  if (!user.is_active) {
    throw { statusCode: 403, message: "Account deactivated." };
  }
  if (user.is_locked) {
    throw { statusCode: 403, message: "Account locked." };
  }
  return user;
}

const VERIFICATION_CODE_EXPIRED = {
  statusCode: 400,
  code: "VERIFICATION_CODE_EXPIRED",
  message: "This verification code has expired. Please request a new one.",
};

export async function verifyEmail({ email, otp }) {
  const lowerEmail = email.toLowerCase();
  const { Users, sequelize } = db;

  // Select the full row: on success we log the user straight in, which needs
  // the same fields login() reads. Expiry is judged by the database clock — the
  // same one that set expires_at.
  const user = await findAccountAwaitingVerification(lowerEmail, {
    attributes: {
      include: [[sequelize.literal("(expires_at IS NULL OR expires_at <= NOW())"), "otp_expired"]],
    },
  });

  if (!user.otp || user.get("otp_expired")) {
    throw VERIFICATION_CODE_EXPIRED;
  }

  if (String(user.otp) !== String(otp)) {
    throw {
      statusCode: 400,
      code: "VERIFICATION_CODE_INVALID",
      message: "Invalid verification code. Make sure you use the code from the most recent email.",
    };
  }

  // Conditional on the same code still being current and unexpired, so a code
  // that was replaced or ran out between the read and here can't slip through,
  // and a double submit can't verify twice.
  const [updated] = await Users.update(
    { is_verified: true, otp: null, expires_at: null, otp_resend_count: null, last_otp_sent_at: null },
    {
      where: {
        users_id: user.users_id,
        is_verified: false,
        otp: user.otp,
        expires_at: { [Op.gt]: sequelize.fn("NOW") },
      },
    },
  );
  if (!updated) {
    throw VERIFICATION_CODE_EXPIRED;
  }

  // Verifying proves ownership of the address, and the password was already set
  // at sign-up — so hand back a session instead of bouncing the user to the
  // login screen before they can finish onboarding.
  return issueUserSession(user);
}
// Helper function to send verification email
async function sendVerificationEmail(
  email,
  otp,
  resetPasswordToken = null,
  inviteToken = null,
) {
  let subject;
  let verificationLink;
  let text;
  let html;
  let pillText;
  try {
    if (resetPasswordToken) {
      subject = "CRMSimplify - Password Reset Request";
      pillText = "Password Reset";
      verificationLink = `${env.EMAIL.FRONTEND_BASE_URL}/auth/reset-password?token=${resetPasswordToken}&email=${email}`;
      text = `You requested a password reset. Use the following link to reset your password:\n\n${verificationLink}\n\nThis link will expire in 10 minutes.`;
      html = wrapAuthEmailHTML({
        subject,
        pillText,
        bodyHtml: `
          <p style="margin: 0 0 16px;">You requested a password reset. Use the button below to reset your password:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verificationLink}" target="_blank" style="display: inline-block; box-sizing: border-box; background-color: #0056b3; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 14px; font-weight: 700;">Reset Password</a>
          </div>
          <p style="margin: 16px 0 0; color: #64748b; font-size: 13px;">This link will expire in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
        `
      });
    } else if (inviteToken) {
      subject = "Invitation to Join";
      pillText = "Invitation";
      verificationLink = `${env.EMAIL.FRONTEND_BASE_URL}/auth/accept-invite?token=${inviteToken}&email=${email}`;
      text = `You have been invited to join. Please click the following link to accept the invitation:\n\n${verificationLink}\n\nThis link will expire in 10 minutes.`;
      html = wrapAuthEmailHTML({
        subject,
        pillText,
        bodyHtml: `
          <p style="margin: 0 0 16px;">You have been invited to join our platform. Please click the button below to accept the invitation and set up your account:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verificationLink}" target="_blank" style="display: inline-block; box-sizing: border-box; background-color: #0056b3; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 14px; font-weight: 700;">Accept Invitation</a>
          </div>
          <p style="margin: 16px 0 0; color: #64748b; font-size: 13px;">This link will expire in 10 minutes.</p>
        `
      });
    } else {
      // Verification codes go through email-verification.service.js, which
      // also throttles and expires them.
      throw new Error("sendVerificationEmail requires a reset-password or invite token.");
    }

    return await sendEmail(email, subject, text, html);
  } catch (error) {
    console.error("Email sending error:", error);
    return false;
  }
}

// Link email for the set-password flow (adding a local password to an OAuth /
// Google account). Mirrors the reset-password template: a single-use, expiring
// link into the frontend set-password page. No code is shared — the token in
// the link is the secret.
async function sendSetPasswordLinkEmail(email, token) {
  try {
    const subject = "Set Your Password";
    const verificationLink = `${env.EMAIL.FRONTEND_BASE_URL}/auth/set-password?token=${token}&email=${email}`;
    const text = `To enable email/password login on your account, set your password using the following link:\n\n${verificationLink}\n\nThis link will expire in 10 minutes. If you didn't request this, you can safely ignore this email.`;
    const html = wrapAuthEmailHTML({
      subject,
      pillText: "Setup",
      bodyHtml: `
        <p style="margin: 0 0 16px;">To enable email/password login on your account, set your password using the button below:</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verificationLink}" target="_blank" style="display: inline-block; box-sizing: border-box; background-color: #0056b3; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 14px; font-weight: 700;">Set Password</a>
        </div>
        <p style="margin: 16px 0 0; color: #64748b; font-size: 13px;">This link will expire in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      `
    });
    return await sendEmail(email, subject, text, html);
  } catch (error) {
    console.error("Set-password link email error:", error);
    return false;
  }
}

// RESEND OTP
// Issues a fresh 10-minute code, throttled by email-verification.service.js
// (cooldown between sends; hourly cap that lifts once the current code expires).
export async function resendOtp(email) {
  const lowerEmail = email.toLowerCase();

  const user = await findAccountAwaitingVerification(lowerEmail, {
    attributes: ["users_id", "email", "is_verified", "is_active", "is_locked", "is_sample_data"],
  });

  const result = await sendVerificationCode({ users_id: user.users_id, email: lowerEmail });
  return { email: lowerEmail, ...result };
}

// LOGIN
export async function login({ email, login_id, password }) {
  const { Users, UsersToken, sequelize } = db;

  // Build where clause based on email or login_id
  let whereClause;
  const identifier = email || login_id;

  if (identifier) {
    whereClause = {
      [Op.or]: [
        sequelize.where(sequelize.fn("LOWER", sequelize.col("email")), identifier.toLowerCase()),
        { login_id: identifier }
      ]
    };
  } else {
    throw { statusCode: 400, message: "Email or login ID is required." };
  }

  const user = await Users.findOne({
    where: {
      [Op.and]: [whereClause, { is_deleted: false }],
    },
  });

  if (!user) {
    throw { statusCode: 401, message: "Invalid credentials." };
  }

  if (!user.is_active) {
    throw { statusCode: 403, message: "Account deactivated." };
  }

  if (user.is_locked) {
    throw { statusCode: 403, message: "Account locked." };
  }

  // An unverified account with no local password (e.g. a sample-data row) has
  // nothing to prove who is asking — refuse without mailing it a code. Accounts
  // with a password are checked after the password matches, below.
  if (!user.is_verified && !user.password) {
    throw { statusCode: 400, code: "EMAIL_NOT_VERIFIED", message: "Please verify your email first." };
  }

  // OAuth users (e.g. signed up via Google) have no local password yet. The
  // email exists but was registered via a social provider, so we automatically
  // email a set-password link and return a SUCCESS response telling the user to
  // check their email. The frontend reads `requirePasswordSetup` to show the
  // "check your email" state. The link send is best-effort: a mail hiccup must
  // not break the response.
  if (!user.password) {
    const provider =
      user.auth_provider && user.auth_provider !== "local" ? user.auth_provider : "Google";
    const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);

    try {
      await requestSetPasswordLink(user.email);
    } catch (linkError) {
      console.error("Auto set-password link send failed during login:", linkError.message);
    }

    return {
      requirePasswordSetup: true,
      message: `This email is registered with ${providerLabel} sign-in. We've emailed you a link to set a password — open it to enable email/password login.`,
    };
  }

  // The account has a local password, so one must be supplied to log in.
  if (!password) {
    throw { statusCode: 400, message: "Password is required." };
  }

  // Decrypt password with fallback
  let decryptedPassword;
  try {
    decryptedPassword = decrypt(user.password);
  } catch (decryptError) {
    try {
      decryptedPassword = base64Decrypt(user.password);
    } catch (fallbackError) {
      console.error("Fallback decryption also failed:", fallbackError.message);
      throw { statusCode: 500, message: "Invalid password format." };
    }
  }

  // Wrong password — increment failed_attempts
  if (decryptedPassword !== password) {
    const newFailedAttempts = (user.failed_attempts || 0) + 1;

    await Users.update(
      {
        failed_attempts: newFailedAttempts,
        // Lock account if 5 or more failed attempts
        ...(newFailedAttempts >= 5 && { is_locked: true }),
      },
      { where: { users_id: user.users_id } },
    );

    throw { statusCode: 401, message: "Invalid email or password." };
  }

  // Reset failed attempts on successful password match
  await Users.update(
    { failed_attempts: 0 },
    { where: { users_id: user.users_id } },
  );

  // Right password, unverified email: no session. If their last code has
  // expired (or was never delivered) mail a fresh one so the verify screen the
  // frontend routes to has a working code waiting; a still-valid code is left
  // alone so repeated sign-in attempts don't spam the inbox.
  if (!user.is_verified) {
    let sent = false;
    try {
      ({ sent } = await sendVerificationCode(user, { onlyWhenNoActiveCode: true }));
    } catch (sendError) {
      console.error("Verification code send during login failed:", sendError?.message || sendError);
    }
    throw {
      statusCode: 400,
      code: "EMAIL_NOT_VERIFIED",
      message: sent
        ? "Please verify your email first. We've sent a new verification code to your inbox."
        : "Please verify your email first. Use the code from your latest verification email, or request a new one.",
    };
  }

  // Force password change if required. No session/JWT is issued until the
  // password is changed — instead we mint a short-lived reset token (same
  // mechanism as forgot-password) and return it so the frontend can route
  // straight into the reset-password screen. resetPassword() clears
  // next_login_password_change once the new password is set.
  if (user.next_login_password_change) {
    const resetPasswordToken = crypto.randomUUID();
    await Users.update(
      {
        reset_password_token: resetPasswordToken,
        reset_token_expires_at: db.sequelize.literal("NOW() + INTERVAL '30 minutes'"),
      },
      { where: { users_id: user.users_id } },
    );
    return {
      requirePasswordChange: true,
      message: "You must change your password before continuing.",
      resetPasswordToken,
      user: {
        id: user.users_id,
        email: user.email,
        role_id: user.role_id,
      },
    };
  }

  const accessToken = generateAccessToken(user.users_id);
  const refreshToken = generateRefreshToken(user.users_id);

  await UsersToken.create({
    user_id: user.users_id,
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Phase 4 — the frontend reads isOnboardingFinished to decide whether
  // to drop the user on the dashboard or push them back into onboarding.
  // Company Administrator users sit under company_id directly; sub-users
  // sit under builder_id and inherit the company via Builder.company_id.
  const { Company, Builder } = db;
  let company = null;
  if (user.company_id) {
    company = await Company.findByPk(user.company_id, {
      attributes: ["company_id", "is_onboarding_finished"],
    });
  } else if (user.builder_id) {
    const builder = await Builder.findByPk(user.builder_id, { attributes: ["company_id"] });
    if (builder?.company_id) {
      company = await Company.findByPk(builder.company_id, {
        attributes: ["company_id", "is_onboarding_finished"],
      });
    }
  }
  const { Role, Job } = db.sequelize.models;
  let trackingToken = null;
  const userRole = await Role.findByPk(user.role_id, { attributes: ["name"] });
  if (userRole?.name === "Contact") {
    const job = await Job.findOne({
      where: { customer_contact_id: user.users_id },
      attributes: ["tracking_token", "job_id"],
      order: [["created_at", "DESC"]],
    });
    if (job) {
      trackingToken = job.trackingToken || job.tracking_token || job.jobId || job.job_id;
    }
  }

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.users_id,
      email: user.email,
      role_id: user.role_id,
      auth_provider: user.auth_provider,
      hasPassword: !!user.password,
      trackingToken,
    },
    companyId: company?.company_id || null,
    isOnboardingFinished: company ? !!company.is_onboarding_finished : false,
  };
}

// LOGOUT
export async function logout(user) {
  const { UsersToken } = db;

  if (!user || !user.access_token) {
    return;
  }

  await UsersToken.destroy({
    where: {
      user_id: user.user_id,
      access_token: user.access_token,
    },
  });
}

// FORGOT PASSWORD

//forget
export async function forgotPassword(email) {
  const { Users, sequelize } = db;

  const lowerEmail = email.toLowerCase();

  const user = await Users.findOne({
    attributes: ["users_id"],
    where: sequelize.where(
      sequelize.fn("LOWER", sequelize.col("email")),
      lowerEmail,
    ),
  });

  if (!user) {
    throw { statusCode: 404, message: "No user found." };
  }

  const token = crypto.randomUUID();

  // Save to DB first, then send email
  await Users.update(
    {
      reset_password_token: token,
      reset_token_expires_at: sequelize.literal("NOW() + INTERVAL '10 minutes'"),
    },
    {
      where: sequelize.where(
        sequelize.fn("LOWER", sequelize.col("email")),
        lowerEmail,
      ),
    },
  );

  await sendVerificationEmail(lowerEmail, null, token);
}
// RESET PASSWORD
export async function resetPassword({ email, resetPasswordToken, password }) {
  const { Users, sequelize } = db;

  const lowerEmail = email.toLowerCase();

  const user = await Users.findOne({
    attributes: ["users_id", "reset_token_expires_at"],
    where: {
      [Op.and]: [
        sequelize.where(
          sequelize.fn("LOWER", sequelize.col("email")),
          lowerEmail,
        ),
        { reset_password_token: resetPasswordToken },
      ],
    },
  });

  if (!user) {
    throw { statusCode: 400, message: "Invalid reset token." };
  }

  // Timezone-safe comparison
  if (new Date() > new Date(user.reset_token_expires_at)) {
    throw { statusCode: 400, message: "Reset token expired." };
  }

  await Users.update(
    {
      password: encrypt(password),
      reset_password_token: null,
      reset_token_expires_at: null,
      next_login_password_change: false,
    },
    { where: { users_id: user.users_id } },
  );
}
// SET PASSWORD (step 1) — email a single-use link to add a local password to an
// OAuth (Google) account. The link carries a token that proves email ownership.
// Only valid for accounts that have no local password yet. No code is shared.
export async function requestSetPasswordLink(email) {
  const { Users, sequelize } = db;
  const lowerEmail = email.toLowerCase();

  const user = await Users.findOne({
    attributes: ["users_id", "password"],
    where: {
      [Op.and]: [
        sequelize.where(sequelize.fn("LOWER", sequelize.col("email")), lowerEmail),
        { is_deleted: false },
      ],
    },
  });

  if (!user) {
    throw { statusCode: 404, message: "User not found." };
  }

  if (user.password) {
    throw {
      statusCode: 409,
      message: "A password is already set. Use forgot password instead.",
    };
  }

  // Single-use, 10-minute token — reuses the reset-password token columns (these
  // accounts have no password, so there's no conflict with a real reset).
  const token = crypto.randomUUID();

  await Users.update(
    {
      reset_password_token: token,
      reset_token_expires_at: sequelize.literal("NOW() + INTERVAL '10 minutes'"),
    },
    { where: { users_id: user.users_id } },
  );

  await sendSetPasswordLinkEmail(lowerEmail, token);

  return { email: lowerEmail };
}

// SET PASSWORD (step 2) — verify the link token and set the first local password
// for an OAuth (Google) account. Afterwards the user can log in via both
// email/password and Google. Accounts that already have a password must use the
// forgot-password / change-password flows instead.
export async function setPassword(email, token, password) {
  const { Users, sequelize } = db;
  const lowerEmail = email.toLowerCase();

  const user = await Users.findOne({
    attributes: ["users_id", "password", "reset_password_token", "reset_token_expires_at"],
    where: {
      [Op.and]: [
        sequelize.where(sequelize.fn("LOWER", sequelize.col("email")), lowerEmail),
        { is_deleted: false },
      ],
    },
  });

  if (!user) {
    throw { statusCode: 404, message: "User not found." };
  }

  if (user.password) {
    throw {
      statusCode: 409,
      message: "A password is already set. Use forgot password instead.",
    };
  }

  if (!token || user.reset_password_token !== token) {
    throw { statusCode: 400, message: "Invalid or missing link token." };
  }

  if (!user.reset_token_expires_at || new Date() > new Date(user.reset_token_expires_at)) {
    throw { statusCode: 400, message: "This link has expired. Please request a new one." };
  }

  await Users.update(
    {
      password: encrypt(password),
      reset_password_token: null,
      reset_token_expires_at: null,
      next_login_password_change: false,
    },
    { where: { users_id: user.users_id } },
  );

  return { id: user.users_id, email: lowerEmail };
}

export async function refreshToken(refreshToken) {
  const { UsersToken } = db;

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.JWT.JWT_REFRESH_SECRET);
  } catch (err) {
    throw { statusCode: 401, message: "Invalid refresh token." };
  }

  const token = await UsersToken.findOne({
    where: {
      user_id: decoded.userId,
      refresh_token: refreshToken,
    },
  });

  if (!token) {
    throw { statusCode: 401, message: "Token expired or invalid." };
  }

  const newAccessToken = generateAccessToken(decoded.userId);

  await UsersToken.update(
    { access_token: newAccessToken },
    {
      where: {
        user_id: decoded.userId,
        refresh_token: refreshToken,
      },
    },
  );

  return { accessToken: newAccessToken };
}

export async function validateTokenAndUser(token, userId) {
  const { Users, UsersToken } = db;

  try {
    const user = await Users.findOne({
      where: {
        users_id: userId,
        is_verified: true,
      }
    });

    if (!user) return null;

    if (user.is_deleted) {
      throw { custom: true, statusCode: 403, message: "Unauthorized: Account deleted." };
    }
    if (!user.is_active) {
      throw { custom: true, statusCode: 403, message: "Your account has been deactivated. Please contact your administrator." };
    }
    if (user.is_locked) {
      throw { custom: true, statusCode: 403, message: "Your account has been locked. Please contact your administrator." };
    }

    const tokenRecord = await UsersToken.findOne({
      where: {
        user_id: userId,
        access_token: token,
      }
    });

    if (!tokenRecord) return null;

    return user.get({ plain: true });
  } catch (error) {
    console.error("AuthService.validateTokenAndUser error:", error);
    throw error;
  }
}

export async function getCompanyByBuilderId(builderId) {
  const { Company } = db;

  try {
    const company = await Company.findOne({
      where: { builder_id: builderId },
      attributes: ["company_id"],
    });

    return company ? company.get({ plain: true }) : null;
  } catch (error) {
    console.error("AuthService.getCompanyByBuilderId error:", error);
    throw error;
  }
}

export async function autoRegisterGoogleUser(profile, email) {
  const { Users, Builder, Role, sequelize } = db;

  // Find default Company Administrator role
  const CompanyRole = await Role.findOne({
    where: { name: "Company Administrator", company_id: null },
  });
  if (!CompanyRole) {
    throw { statusCode: 500, message: "Default Builder role not found in the database." };
  }
  const role_id = CompanyRole.role_id;

  const result = await sequelize.transaction(async (t) => {
    const displayName = profile.displayName || email.split("@")[0];
    // Create builder
    const builder = await Builder.create(
      { name: `${displayName}'s Company`, email },
      { transaction: t }
    );
    const builder_id = builder.builder_id;

    // Create root user via Google
    const user = await Users.create(
      {
        builder_id,
        name: displayName,
        email: email,
        role_id,
        password: null, // No local password
        is_verified: true, // Google email is already verified
        root_user: true,
        auth_provider: "google",
      },
      { transaction: t }
    );

    // Create default company
    const defaultCompanyPayload = {
      name: `${displayName}`,
      abn_number: null,
      timezone_id: null,
      address: null,
      bank_name: null,
      account_name: null,
      account_number: null,
      account_bsb: null,
      email_signature_logo: null,
      company_logo: null,
    };

    const companyResult = await upsertCompanyService({ builderId: builder_id }, defaultCompanyPayload, t);
    const company_id = companyResult?.companyId || null;

    if (company_id) {
      await user.update({ company_id }, { transaction: t });
    }

    // Seed all default settings
    await seedBuilderDefaults({
      company_id,
      builder_id,
      created_by: user.users_id,
      transaction: t,
    });

    // Provision per-company RBAC roles + permissions
    const roleIdMapping = await seedCompanyRbac({
      company_id,
      builder_id,
      created_by: user.users_id,
      transaction: t,
    });

    const companyAdminRoleId = roleIdMapping && roleIdMapping.get(role_id);
    if (companyAdminRoleId) {
      await user.update({ role_id: companyAdminRoleId }, { transaction: t });
    }

    return user;
  });

  return result;
}

export async function handleGoogleCallback(user) {
  const { UsersToken } = db;

  const accessToken = generateAccessToken(user.users_id);
  const refreshToken = generateRefreshToken(user.users_id);

  await UsersToken.create({
    user_id: user.users_id,
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return {
    accessToken,
    refreshToken,
  };
}

export default {
  login,
  registerRoot,
  verifyEmail,
  forgotPassword,
  resetPassword,
  requestSetPasswordLink,
  setPassword,
  resendOtp,
  refreshToken,
  logout,
  validateTokenAndUser,
  getCompanyByBuilderId,
  handleGoogleCallback,
  autoRegisterGoogleUser,
};
