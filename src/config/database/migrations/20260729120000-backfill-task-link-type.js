"use strict";

/**
 * Backfills `task.link_type` for rows created before it was derived.
 *
 * Tasks created from a lead or job timeline were stored with a null link_type
 * whenever the client did not send one explicitly, so the /task response
 * reported `linkType: null` and filtering by link_type skipped them. The
 * service now derives the value on create (see resolveLinkType in
 * task.service.js); this fills in the rows that already exist.
 *
 * Job-scoped tasks become "Job" and lead-scoped ones "Sales", matching the
 * vocabulary the notes module validates against ("Sales", "Job", "General",
 * "Construction", "Maintenance"). Rows with neither id keep their null — there
 * is nothing to infer a type from.
 *
 * Only null link_type rows are touched, so an already-classified task (say a
 * "Construction" one) is never overwritten and re-running is a no-op.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  await queryInterface.sequelize.query(`
    UPDATE task
       SET link_type = 'Job'
     WHERE link_type IS NULL
       AND job_id IS NOT NULL
  `);

  await queryInterface.sequelize.query(`
    UPDATE task
       SET link_type = 'Sales'
     WHERE link_type IS NULL
       AND job_id IS NULL
       AND lead_id IS NOT NULL
  `);
}

export async function down() {
  // Irreversible by design: the pre-backfill nulls are indistinguishable from
  // rows that legitimately had no type, so restoring them would clear values
  // the app now relies on.
}
