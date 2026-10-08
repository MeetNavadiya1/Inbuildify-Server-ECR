'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('featur_facade', {
      featur_facade_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()')
      },
      builder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'builder',
          key: 'builder_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'company',
          key: 'company_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      is_delete: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('featur_facade', ['builder_id']);
    await queryInterface.addIndex('featur_facade', ['company_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('featur_facade');
  }
};
