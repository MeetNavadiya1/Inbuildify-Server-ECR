/**
 * Migration: add builder_id, company_id, and status columns to the job table.
 *
 * Background
 * ----------
 * The original job table only had: job_id, reference_number, opportunity_id,
 * quotation_version_id, job_note, send_email, created_at, updated_at.
 *
 * Without builder_id / company_id directly on job, tenant-scoping required
 * an INNER JOIN through opportunity → leads.  Any job whose opportunity_id is
 * NULL (allowNull: true in the model) or whose chain is broken silently drops
 * the row from every listing query.  Storing these IDs directly on job makes
 * scoping reliable and the queries simpler.
 *
 * Without the status column, every SELECT that references j.status fails at
 * PostgreSQL parse time (error 42703 – column does not exist) so the entire
 * GET /job endpoint returns 500 and the listing page stays empty.
 *
 * All three ADD COLUMN statements use IF NOT EXISTS so the migration is safe
 * to run even if it was partially applied before.
 *
 * After adding the columns we back-fill builder_id / company_id for every
 * existing job row by walking job → opportunity → leads.
 */

export async function up(queryInterface) {
  // ── 1. Add the three columns safely ──────────────────────────────────────
  await queryInterface.sequelize.query(`
    ALTER TABLE job
      ADD COLUMN IF NOT EXISTS status       VARCHAR(50) NOT NULL DEFAULT 'In Progress',
      ADD COLUMN IF NOT EXISTS builder_id   UUID,
      ADD COLUMN IF NOT EXISTS company_id   UUID;
  `);

  // ── 2. Back-fill builder_id + company_id for existing rows ──────────────
  await queryInterface.sequelize.query(`
    UPDATE job j
    SET
      builder_id = l.builder_id,
      company_id = l.company_id
    FROM opportunity o
    JOIN leads l ON l.leads_id = o.leads_id
    WHERE j.opportunity_id = o.opportunity_id
      AND (j.builder_id IS NULL OR j.company_id IS NULL);
  `);
}

export async function down(queryInterface) {
  await queryInterface.sequelize.query(`
    ALTER TABLE job
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS builder_id,
      DROP COLUMN IF EXISTS company_id;
  `);
}
