'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('facade');
    if (!tableInfo.best_faced) {
      await queryInterface.addColumn('facade', 'best_faced', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('facade');
    if (tableInfo.best_faced) {
      await queryInterface.removeColumn('facade', 'best_faced');
    }
  }
};
