'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('drive');

    if (!tableInfo.parent_id) {
      await queryInterface.addColumn('drive', 'parent_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'drive',
          key: 'drive_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      });
    }

    if (!tableInfo.deleted_at) {
      await queryInterface.addColumn('drive', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  async down (queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('drive');
    if (tableInfo.parent_id) {
      await queryInterface.removeColumn('drive', 'parent_id');
    }
    if (tableInfo.deleted_at) {
      await queryInterface.removeColumn('drive', 'deleted_at');
    }
  }
};
