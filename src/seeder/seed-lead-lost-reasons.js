import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default lead lost reasons for a new builder
 */
export async function seedLeadLostReasons({
  company_id,
  builder_id,
  created_by,
  transaction,
}) {
  const { LeadLostReason } = db;

  const DEFAULT_LEAD_LOST_REASONS = [
    { lost_reason: "Budget Constraints", sort_order: 1 },
    { lost_reason: "Went with Competitor", sort_order: 2 },
    { lost_reason: "Project Cancelled", sort_order: 3 },
    { lost_reason: "Unresponsive", sort_order: 4 },
    { lost_reason: "Timing", sort_order: 5 },
    { lost_reason: "Other", sort_order: 6 },
  ];

  await LeadLostReason.bulkCreate(
    DEFAULT_LEAD_LOST_REASONS.map((row) => ({
      ...row,
      company_id,
      builder_id,
      created_by,
      updated_by: created_by,
      is_active: true,
    })),
    { transaction, ignoreDuplicates: true }
  );
}

export default { seedLeadLostReasons };
