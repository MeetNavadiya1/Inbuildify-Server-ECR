"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("job_variation");

    if (!tableInfo.variation_date) {
      await queryInterface.addColumn("job_variation", "variation_date", {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }

    if (!tableInfo.show_price_master_in_pdf) {
      await queryInterface.addColumn("job_variation", "show_price_master_in_pdf", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("job_variation", "variation_date");
    await queryInterface.removeColumn("job_variation", "show_price_master_in_pdf");
  },
};
