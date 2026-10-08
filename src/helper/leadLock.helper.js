import db from "../config/database/models/postgre-models/index.js";

/**
 * Checks if a lead is locked.
 * A lead is considered locked if any associated opportunity has an out_come in
 * `blockOutcomes`. Throws an error if the lead is locked.
 *
 * By default both 'won' and 'lost' lock the lead. Callers that should still work
 * once the lead has become a job (out_come 'won') — e.g. job notes/tasks/
 * appointments — can pass { blockOutcomes: ['lost'] } to allow 'won'.
 *
 * @param {string} leadId - The UUID of the lead to check.
 * @param {object|null} transaction - Optional Sequelize transaction.
 * @param {{ blockOutcomes?: string[] }} [options] - Which outcomes lock the lead.
 */
export const checkLeadLockStatus = async (leadId, transaction = null, options = {}) => {
  if (!leadId) return;

  const { blockOutcomes = ['lost', 'won'] } = options;
  if (!blockOutcomes.length) return;

  const { Opportunity } = db;

  const opportunity = await Opportunity.findOne({
    where: {
      leads_id: leadId,
      out_come: {
        [db.Sequelize.Op.in]: blockOutcomes
      }
    },
    attributes: ['out_come'],
    raw: true,
    transaction
  });

  if (opportunity) {
    const outCome = opportunity.out_come;
    const error = new Error(`This action cannot be performed because an associated opportunity has been marked as ${outCome}.`);
    error.status = 400;
    throw error;
  }
};

/**
 * Resolves the job a lead turned into, if any.
 *
 * A won opportunity is converted into a job row, so a lead with out_come 'won'
 * is no longer a sales lead — it is a job. Callers that only hold a lead id
 * (global "Create Task", lead search dropdowns) use this to scope the record to
 * the job instead of hitting the won-lead lock.
 *
 * @param {string} leadId - The UUID of the lead.
 * @param {object|null} transaction - Optional Sequelize transaction.
 * @returns {Promise<string|null>} job_id, or null when the lead has no job yet.
 */
export const resolveJobIdForLead = async (leadId, transaction = null) => {
  if (!leadId) return null;

  const { Job, Opportunity } = db;

  const job = await Job.findOne({
    attributes: ["job_id"],
    include: [
      {
        model: Opportunity,
        as: "opportunity",
        attributes: [],
        where: { leads_id: leadId, out_come: "won" },
        required: true,
      },
    ],
    // A lead can carry more than one opportunity; the newest job wins.
    order: [["createdAt", "DESC"]],
    raw: true,
    transaction,
  });

  return job?.job_id ?? null;
};
