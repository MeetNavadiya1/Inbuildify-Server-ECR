/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const driveInfo = await queryInterface.describeTable('drive');
      if (!driveInfo.is_starred) {
        await queryInterface.addColumn('drive', 'is_starred', { type: Sequelize.BOOLEAN, defaultValue: false }, { transaction });
      }
      if (!driveInfo.sort_order) {
        await queryInterface.addColumn('drive', 'sort_order', { type: Sequelize.INTEGER, defaultValue: 0 }, { transaction });
      }

      const filesInfo = await queryInterface.describeTable('drive_files');
      if (!filesInfo.is_starred) {
        await queryInterface.addColumn('drive_files', 'is_starred', { type: Sequelize.BOOLEAN, defaultValue: false }, { transaction });
      }
      if (!filesInfo.sort_order) {
        await queryInterface.addColumn('drive_files', 'sort_order', { type: Sequelize.INTEGER, defaultValue: 0 }, { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const driveInfo = await queryInterface.describeTable('drive');
      if (driveInfo.is_starred) await queryInterface.removeColumn('drive', 'is_starred', { transaction });
      if (driveInfo.sort_order) await queryInterface.removeColumn('drive', 'sort_order', { transaction });

      const filesInfo = await queryInterface.describeTable('drive_files');
      if (filesInfo.is_starred) await queryInterface.removeColumn('drive_files', 'is_starred', { transaction });
      if (filesInfo.sort_order) await queryInterface.removeColumn('drive_files', 'sort_order', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
