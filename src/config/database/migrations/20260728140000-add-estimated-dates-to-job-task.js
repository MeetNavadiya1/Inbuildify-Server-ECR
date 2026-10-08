"use strict";

/**
 * Adds the estimated-date columns that back the Job → Workflow settings.
 *
 * The workflow schedule (pre-construction / construction / post-construction —
 * every `job_process_stage` whose functionality is a workflow one) is derived
 * from each task's `no_of_days` chained in stage → sub-stage → task order, and
 * the derived dates are persisted here so they can be read back without
 * re-walking the chain, and so a manual override survives a recalculation.
 *
 *   estimated_start_date  — first working day of the task
 *   estimated_end_date    — working day on which the task's duration is consumed
 *   estimated_date_locked — the end date was set by hand, so the recalculation
 *                           keeps it instead of deriving one
 *   actual_date_applied   — the chain has been shifted onto this task's actual
 *                           date. Set automatically when "Re-calculate the
 *                           Estimated dates automatically based on Actual date
 *                           changes" is on, otherwise only after the user
 *                           confirms the change.
 *
 * Guarded with describeTable so re-running against a DB already carrying the
 * columns (e.g. one synced via sequelize.sync) is a no-op.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const jobTask = await queryInterface.describeTable("job_task");

  if (!jobTask.estimated_start_date) {
    await queryInterface.addColumn("job_task", "estimated_start_date", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  }

  if (!jobTask.estimated_end_date) {
    await queryInterface.addColumn("job_task", "estimated_end_date", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  }

  if (!jobTask.estimated_date_locked) {
    await queryInterface.addColumn("job_task", "estimated_date_locked", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }

  if (!jobTask.actual_date_applied) {
    await queryInterface.addColumn("job_task", "actual_date_applied", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job_task", "estimated_start_date");
  await queryInterface.removeColumn("job_task", "estimated_end_date");
  await queryInterface.removeColumn("job_task", "estimated_date_locked");
  await queryInterface.removeColumn("job_task", "actual_date_applied");
}
