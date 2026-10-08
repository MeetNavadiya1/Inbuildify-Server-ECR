"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("job_variation_item");

    if (!tableInfo.is_removed) {
      await queryInterface.addColumn("job_variation_item", "is_removed", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("job_variation_item", "is_removed");
  },
};
