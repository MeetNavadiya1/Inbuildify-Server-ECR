/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tables = [
      'drive',
      'drive_files',
      'drive_activity_logs',
      'drive_shares',
      'drive_file_versions'
    ];

    for (const table of tables) {
      const tableInfo = await queryInterface.describeTable(table);

      if (tableInfo.createdAt && !tableInfo.created_at) {
        await queryInterface.renameColumn(table, 'createdAt', 'created_at');
      }
      if (tableInfo.updatedAt && !tableInfo.updated_at) {
        await queryInterface.renameColumn(table, 'updatedAt', 'updated_at');
      }
      if (tableInfo.deletedAt && !tableInfo.deleted_at) {
        await queryInterface.renameColumn(table, 'deletedAt', 'deleted_at');
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = [
      'drive',
      'drive_files',
      'drive_activity_logs',
      'drive_shares',
      'drive_file_versions'
    ];

    for (const table of tables) {
      const tableInfo = await queryInterface.describeTable(table);

      if (tableInfo.created_at && !tableInfo.createdAt) {
        await queryInterface.renameColumn(table, 'created_at', 'createdAt');
      }
      if (tableInfo.updated_at && !tableInfo.updatedAt) {
        await queryInterface.renameColumn(table, 'updated_at', 'updatedAt');
      }
      if (tableInfo.deleted_at && !tableInfo.deletedAt) {
        await queryInterface.renameColumn(table, 'deleted_at', 'deletedAt');
      }
    }
  }
};
