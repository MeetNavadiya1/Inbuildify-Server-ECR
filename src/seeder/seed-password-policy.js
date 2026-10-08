import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default password_policy for a new builder
 */
export async function seedPasswordPolicy({ company_id, builder_id, created_by, transaction }) {
  const { PasswordPolicy } = db;

  await PasswordPolicy.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      expires_in_days: 90,
      invalid_attempt_limit: 5,
      alert_before_expiry_days: 7,
      password_history_count: 5,
      enforce_strong_password: true,
      is_active: true,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedPasswordPolicy };
