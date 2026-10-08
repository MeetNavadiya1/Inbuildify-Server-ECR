'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('facade');
    if (!tableInfo.is_collab) {
      await queryInterface.addColumn('facade', 'is_collab', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('facade', 'is_collab');
  }
};
