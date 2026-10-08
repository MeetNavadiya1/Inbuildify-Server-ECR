import crypto from "crypto";
import { Op } from "sequelize";
import { env } from "../../config/env.config.js";
import sendEmail from "../../service/sendMail.service.js";
import { wrapAuthEmailHTML } from "../../templates/auth-email.template.js";
import db from "../../config/database/models/postgre-models/index.js";

/**
 * Email verification codes — the one place that issues, emails and throttles
 * them, shared by every sign-up path, the resend endpoint and login.
 *
 * The rules:
 *   - every email carries a fresh code valid for OTP_TTL_MINUTES; sending a new
 *     one replaces the previous code;
 *   - no two emails within RESEND_COOLDOWN_SECONDS (stops double clicks and
 *     scripted hammering);
 *   - at most MAX_SENDS_PER_WINDOW emails while a code is still valid inside a
 *     rolling SEND_WINDOW_MINUTES window. Once the current code has EXPIRED the
 *     cap no longer applies, so an unverified user can always get a working code
 *     — at worst one email per OTP_TTL_MINUTES.
 *
 * All time arithmetic runs in Postgres against NOW(), so app-server clock or
 * timezone drift can't make a code expire early or a cooldown never end. The
 * throttle check and the write are a single conditional UPDATE, so concurrent
 * requests can't both slip past it and send duplicate emails.
 */
export const OTP_TTL_MINUTES = 10;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_SENDS_PER_WINDOW = 5;
export const SEND_WINDOW_MINUTES = 60;

const CODE_ACTIVE_SQL = "(expires_at IS NOT NULL AND expires_at > NOW())";
const IN_WINDOW_SQL = `(last_otp_sent_at > NOW() - INTERVAL '${SEND_WINDOW_MINUTES} minutes')`;
const IN_COOLDOWN_SQL = `(last_otp_sent_at > NOW() - INTERVAL '${RESEND_COOLDOWN_SECONDS} seconds')`;
const CAP_REACHED_SQL = `(${IN_WINDOW_SQL} AND COALESCE(otp_resend_count, 0) >= ${MAX_SENDS_PER_WINDOW})`;

// last_otp_sent_at IS NULL makes every comparison above NULL (not false), so it
// is handled explicitly: a user who has never been sent a code may always get one.
const SEND_ALLOWED_SQL = `(last_otp_sent_at IS NULL OR (NOT ${IN_COOLDOWN_SQL} AND NOT (${CAP_REACHED_SQL} AND ${CODE_ACTIVE_SQL})))`;

// Seconds until SEND_ALLOWED_SQL turns true: the later of the cooldown ending
// and — while capped with a live code — that code expiring or the window rolling.
const RETRY_AFTER_SQL = `CEIL(GREATEST(0,
  CASE WHEN last_otp_sent_at IS NULL THEN 0 ELSE EXTRACT(EPOCH FROM (last_otp_sent_at + INTERVAL '${RESEND_COOLDOWN_SECONDS} seconds' - NOW())) END,
  CASE WHEN last_otp_sent_at IS NOT NULL AND ${CAP_REACHED_SQL} AND ${CODE_ACTIVE_SQL}
    THEN EXTRACT(EPOCH FROM (LEAST(expires_at, last_otp_sent_at + INTERVAL '${SEND_WINDOW_MINUTES} minutes') - NOW()))
    ELSE 0 END
))`;

export function generateVerificationOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function buildVerificationEmail(email, otp) {
  const subject = "OTP for Email Verification";
  const verificationLink = `${env.EMAIL.FRONTEND_BASE_URL}/auth/verify-email?email=${encodeURIComponent(email)}`;
  const text =
    `Your OTP for email verification is: ${otp}\n\n` +
    `Please verify your email by clicking the following link: ${verificationLink}\n\n` +
    `This code will expire in ${OTP_TTL_MINUTES} minutes. If it has expired, you can request a new one from the verification page.`;
  const html = wrapAuthEmailHTML({
    subject,
    pillText: "Verification",
    bodyHtml: `
      <p style="margin: 0 0 16px;">Please use the verification code below to verify your email address:</p>
      <div style="text-align: center; margin: 32px 0;">
        <div style="display: inline-block; padding: 16px 32px; background-color: #f1f5f9; border-radius: 8px; border: 1px solid #e2e8f0;">
          <span style="font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: 4px;">${otp}</span>
        </div>
      </div>
      <p style="margin: 0 0 16px;">Alternatively, you can verify your email by clicking the button below:</p>
      <div style="text-align: center; margin: 16px 0 32px;">
        <a href="${verificationLink}" target="_blank" style="display: inline-block; box-sizing: border-box; background-color: #0056b3; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 700;">Verify Email</a>
      </div>
      <p style="margin: 16px 0 0; color: #64748b; font-size: 13px;">This code will expire in ${OTP_TTL_MINUTES} minutes. Only the code from the most recent email works. If it has expired, request a new one from the verification page.</p>
    `,
  });
  return { subject, text, html };
}

/**
 * Issue a fresh code to an unverified user and email it.
 *
 * Resolves `{ sent: true, expiresInSeconds, resendAvailableInSeconds }`.
 *
 * Throws:
 *   - 400 EMAIL_ALREADY_VERIFIED
 *   - 429 VERIFICATION_RESEND_THROTTLED, with `retryAfterSeconds`
 *   - 503 VERIFICATION_EMAIL_FAILED when the email could not be queued; the
 *     previous code and throttle state are restored so the user can retry
 *     straight away instead of waiting out a cooldown for an email that never left.
 *
 * With `onlyWhenNoActiveCode`, a user who still holds a valid code (or is
 * throttled) is left alone and it resolves `{ sent: false }` instead of throwing
 * — for login, which nudges rather than spams.
 */
export async function sendVerificationCode({ users_id, email }, { onlyWhenNoActiveCode = false } = {}) {
  const { Users, sequelize } = db;

  const previous = await Users.findOne({
    where: { users_id },
    attributes: ["users_id", "is_verified", "otp", "expires_at", "otp_resend_count", "last_otp_sent_at"],
  });
  if (!previous) {
    throw { statusCode: 404, message: "User not found." };
  }
  if (previous.is_verified) {
    throw { statusCode: 400, code: "EMAIL_ALREADY_VERIFIED", message: "Email already verified. Please sign in." };
  }

  const otp = generateVerificationOtp();
  const conditions = [sequelize.literal(SEND_ALLOWED_SQL)];
  if (onlyWhenNoActiveCode) {
    conditions.push(sequelize.literal(`NOT ${CODE_ACTIVE_SQL}`));
  }

  const [reserved] = await Users.update(
    {
      otp,
      expires_at: sequelize.literal(`NOW() + INTERVAL '${OTP_TTL_MINUTES} minutes'`),
      last_otp_sent_at: sequelize.literal("NOW()"),
      // Right-hand side reads the pre-update row: a send outside the window
      // starts a new count.
      otp_resend_count: sequelize.literal(
        `CASE WHEN last_otp_sent_at IS NOT NULL AND ${IN_WINDOW_SQL} THEN COALESCE(otp_resend_count, 0) + 1 ELSE 1 END`,
      ),
    },
    {
      where: { users_id, is_verified: false, [Op.and]: conditions },
    },
  );

  if (!reserved) {
    if (onlyWhenNoActiveCode) {
      return { sent: false };
    }

    const state = await Users.findOne({
      where: { users_id },
      attributes: ["is_verified", [sequelize.literal(RETRY_AFTER_SQL), "retry_after_seconds"]],
    });
    if (state?.is_verified) {
      throw { statusCode: 400, code: "EMAIL_ALREADY_VERIFIED", message: "Email already verified. Please sign in." };
    }
    // Lost a race with a send that has just happened — its cooldown is the wait.
    const retryAfterSeconds = Math.max(1, Number(state?.get("retry_after_seconds")) || RESEND_COOLDOWN_SECONDS);
    throw {
      statusCode: 429,
      code: "VERIFICATION_RESEND_THROTTLED",
      retryAfterSeconds,
      message: `A verification email was sent recently. Please check your inbox (and spam folder) or try again in ${formatWait(retryAfterSeconds)}.`,
    };
  }

  try {
    const { subject, text, html } = buildVerificationEmail(email, otp);
    await sendEmail(email, subject, text, html);
  } catch (error) {
    console.error("Verification email error:", error?.message || error);
    await Users.update(
      {
        otp: previous.otp,
        expires_at: previous.expires_at,
        otp_resend_count: previous.otp_resend_count,
        last_otp_sent_at: previous.last_otp_sent_at,
      },
      // Guarded on the code we just wrote, so a newer send is never clobbered.
      { where: { users_id, otp } },
    ).catch((restoreError) => {
      console.error("Verification email rollback error:", restoreError?.message || restoreError);
    });
    if (onlyWhenNoActiveCode) {
      return { sent: false };
    }
    throw {
      statusCode: 503,
      expose: true,
      code: "VERIFICATION_EMAIL_FAILED",
      message: "We couldn't send the verification email right now. Please try again in a moment.",
    };
  }

  return {
    sent: true,
    expiresInSeconds: OTP_TTL_MINUTES * 60,
    resendAvailableInSeconds: RESEND_COOLDOWN_SECONDS,
  };
}

/**
 * First code for a freshly created account. The account already exists, so a
 * mail failure must not fail sign-up — the user lands on the verify page and can
 * resend from there (a failed send leaves no cooldown behind).
 */
export async function sendInitialVerificationCode(users_id, email) {
  try {
    const { sent } = await sendVerificationCode({ users_id, email });
    return sent;
  } catch (error) {
    console.error("Initial verification email failed:", error?.message || error);
    return false;
  }
}

/**
 * Sign-up against an address that already has an unverified account: say so
 * with a code, so the frontend can send the user to verify instead of leaving
 * them at a dead-end "already exists".
 */
export function throwIfAwaitingVerification(existingUser) {
  if (
    existingUser.is_verified ||
    existingUser.is_deleted ||
    existingUser.is_sample_data ||
    existingUser.is_active === false ||
    !existingUser.password
  ) {
    return;
  }
  throw {
    statusCode: 409,
    code: "EMAIL_NOT_VERIFIED",
    message: "An account with this email is waiting for email verification. Verify your email to continue.",
  };
}

function formatWait(seconds) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export default {
  OTP_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  MAX_SENDS_PER_WINDOW,
  SEND_WINDOW_MINUTES,
  generateVerificationOtp,
  sendVerificationCode,
  sendInitialVerificationCode,
  throwIfAwaitingVerification,
};
