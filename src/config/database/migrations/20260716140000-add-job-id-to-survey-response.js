"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const columns = await queryInterface.describeTable("survey_response");
    if (!columns.job_id) {
      await queryInterface.addColumn("survey_response", "job_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "job", key: "job_id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
      await queryInterface.addIndex("survey_response", ["job_id"], {
        name: "idx_survey_response_job_id",
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("survey_response", "job_id");
  },
};
