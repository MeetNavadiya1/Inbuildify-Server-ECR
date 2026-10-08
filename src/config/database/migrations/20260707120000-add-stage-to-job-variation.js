"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("job_variation");

    // Current active stage in the variation status tracker (1 = Create,
    // 2 = Approve, 3 = Send to Customer, …). Persisted so the tracker resumes
    // where it left off instead of resetting on every open.
    if (!tableInfo.stage) {
      await queryInterface.addColumn("job_variation", "stage", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("job_variation", "stage");
  },
};
