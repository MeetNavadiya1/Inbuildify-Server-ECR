"use strict";

/**
 * Give the sample-data import somewhere to report how far it has got.
 *
 * Settings → Sample Data shows a progress bar while an import runs, and until
 * now the only thing behind it was the status column: IMPORTING or not. A bar
 * driven by that can show motion but never a number, because nothing in the
 * system measured one — the clone ran as a single opaque call and the screen
 * had no way to tell a job three seconds in from one three minutes in.
 *
 * `progress` is that measurement: percent of the import's phases completed,
 * written by the worker as it crosses each one. It is deliberately a count of
 * work done rather than an estimate of time left — the phases vary wildly in
 * duration (the S3 image copies dominate), so a time estimate would be a guess
 * dressed up as a reading, and the number on that screen has to be one the
 * import actually took.
 *
 * Nullable with a 0 default so rows written before this migration — and any
 * import from a worker that has not been redeployed yet — read as "nothing
 * reported" rather than as a broken bar.
 */

export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists("sample_data_request");
    if (!tableExists) {
      return;
    }

    const table = await queryInterface.describeTable("sample_data_request");
    if (table.progress) {
      return;
    }

    await queryInterface.addColumn("sample_data_request", "progress", {
      type: Sequelize.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    const tableExists = await queryInterface.tableExists("sample_data_request");
    if (!tableExists) {
      return;
    }

    const table = await queryInterface.describeTable("sample_data_request");
    if (!table.progress) {
      return;
    }

    await queryInterface.removeColumn("sample_data_request", "progress");
  },
};
