'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tableInfo = await queryInterface.describeTable('featur_facade');
      
      if (tableInfo.sort_order) {
        await queryInterface.removeColumn('featur_facade', 'sort_order', { transaction });
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
      
      if (!tableInfo.sort_order) {
        await queryInterface.addColumn('featur_facade', 'sort_order', {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          allowNull: false
        }, { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
