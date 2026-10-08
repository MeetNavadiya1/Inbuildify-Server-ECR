'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('appointment');
    if (!tableDefinition.status) {
      await queryInterface.addColumn('appointment', 'status', {
        type: Sequelize.ENUM('yes', 'No', 'May be'),
        defaultValue: 'No',
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('appointment', 'status');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_appointment_status";');
  }
};
