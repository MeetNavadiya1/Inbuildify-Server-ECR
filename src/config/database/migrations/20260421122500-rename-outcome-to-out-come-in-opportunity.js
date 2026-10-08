'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('opportunity');
    if (tableInfo.outcome && !tableInfo.out_come) {
      await queryInterface.renameColumn('opportunity', 'outcome', 'out_come');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('opportunity');
    if (tableInfo.out_come && !tableInfo.outcome) {
      await queryInterface.renameColumn('opportunity', 'out_come', 'outcome');
    }
  }
};
