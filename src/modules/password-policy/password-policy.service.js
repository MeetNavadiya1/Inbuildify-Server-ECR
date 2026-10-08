import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

export async function getPasswordPolicyService({ companyId, builderId, userId }) {
  // ── Try to find existing policy ─────────────────────────────────────────────
  let policy = await db.PasswordPolicy.findOne({
    where: { company_id: companyId, builder_id: builderId },
  });

  // ── Auto-create with defaults if not found ──────────────────────────────────
  if (!policy) {
    policy = await db.PasswordPolicy.create({
      company_id: companyId,
      builder_id: builderId,
      created_by: userId,
      updated_by: userId,
    });
  }

  return keysToCamelCase(policy.toJSON());
}

export async function updatePasswordPolicyService({ builderId, companyId, userId, payload }) {
  const {
    expires_in_days,
    invalid_attempt_limit,
    alert_before_expiry_days,
    password_history_count,
    enforce_strong_password,
  } = payload;

  // ── At least one field required ─────────────────────────────────────────────
  if (
    expires_in_days === undefined &&
    invalid_attempt_limit === undefined &&
    alert_before_expiry_days === undefined &&
    password_history_count === undefined &&
    enforce_strong_password === undefined
  ) {
    const error = new Error("At least one field is required to update.");
    error.status = 400;
    throw error;
  }

  // ── Build update payload (only provided fields) ─────────────────────────────
  const updatePayload = { updated_by: userId };

  if (expires_in_days !== undefined) {
    updatePayload.expires_in_days = expires_in_days;
  }
  if (invalid_attempt_limit !== undefined) {
    updatePayload.invalid_attempt_limit = invalid_attempt_limit;
  }
  if (alert_before_expiry_days !== undefined) {
    updatePayload.alert_before_expiry_days = alert_before_expiry_days;
  }
  if (password_history_count !== undefined) {
    updatePayload.password_history_count = password_history_count;
  }
  if (enforce_strong_password !== undefined) {
    updatePayload.enforce_strong_password = enforce_strong_password;
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  const [affectedCount, [updated]] = await db.PasswordPolicy.update(updatePayload, {
    where: { builder_id: builderId, company_id: companyId, is_active: true },
    returning: true,
  });

  if (affectedCount === 0) {
    const error = new Error("password policy not found.");
    error.status = 404;
    throw error;
  }

  return keysToCamelCase(updated.toJSON());
}
