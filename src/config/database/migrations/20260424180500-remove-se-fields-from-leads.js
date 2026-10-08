'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('leads');
    
    if (tableInfo.structure_engineer_id) {
      await queryInterface.removeColumn('leads', 'structure_engineer_id');
    }
    
    if (tableInfo.structure_report_file) {
      await queryInterface.removeColumn('leads', 'structure_report_file');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('leads', 'structure_engineer_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addColumn('leads', 'structure_report_file', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  }
};
