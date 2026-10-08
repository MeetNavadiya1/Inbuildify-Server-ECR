"use strict";

/**
 * Adds the contract date columns to the `job` table.
 *
 * `contract_prepared_date` / `contract_signed_date` back the contract dates on
 * the Job model — they are required to auto-generate stage-payment invoices
 * (see job-invoice.service.js). Both are nullable: a job exists well before its
 * contract is prepared or signed.
 *
 * Guarded with describeTable so re-running against a DB that already has the
 * columns (e.g. one synced via sequelize.sync) is a no-op.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const jobTable = await queryInterface.describeTable("job");

  if (!jobTable.contract_prepared_date) {
    await queryInterface.addColumn("job", "contract_prepared_date", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  }

  if (!jobTable.contract_signed_date) {
    await queryInterface.addColumn("job", "contract_signed_date", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job", "contract_prepared_date");
  await queryInterface.removeColumn("job", "contract_signed_date");
}
