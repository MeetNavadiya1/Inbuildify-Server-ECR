'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tableInfo = await queryInterface.describeTable('featur_facade');
      
      if (!tableInfo.facade_id) {
        await queryInterface.addColumn('featur_facade', 'facade_id', {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'facade',
            key: 'facade_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        }, { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tableInfo = await queryInterface.describeTable('featur_facade');
      
      if (tableInfo.facade_id) {
        await queryInterface.removeColumn('featur_facade', 'facade_id', { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
