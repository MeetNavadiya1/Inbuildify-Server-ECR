/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('drive_files');
    if (!tableInfo.lead_id) {
      await queryInterface.addColumn('drive_files', 'lead_id', {
        type: Sequelize.UUID,
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('drive_files');
    if (tableInfo.lead_id) {
      await queryInterface.removeColumn('drive_files', 'lead_id');
    }
  }
};
