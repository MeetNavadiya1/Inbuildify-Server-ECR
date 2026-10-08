/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const filesInfo = await queryInterface.describeTable('drive_files');
    if (!filesInfo.thumbnail_s3_key) {
      await queryInterface.addColumn('drive_files', 'thumbnail_s3_key', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!filesInfo.thumbnail_status) {
      await queryInterface.addColumn('drive_files', 'thumbnail_status', {
        type: Sequelize.STRING, // pending | done | failed | not_applicable
        allowNull: true,
        defaultValue: 'pending',
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const filesInfo = await queryInterface.describeTable('drive_files');
    if (filesInfo.thumbnail_s3_key) {
      await queryInterface.removeColumn('drive_files', 'thumbnail_s3_key');
    }
    if (filesInfo.thumbnail_status) {
      await queryInterface.removeColumn('drive_files', 'thumbnail_status');
    }
  },
};
