'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    // Check if table already exists
    const tables = await queryInterface.showAllTables();
    if (tables.includes('featured_facade_lead')) {
      console.log('Table featured_facade_lead already exists, skipping creation.');
      return;
    }

    await queryInterface.createTable('featured_facade_lead', {
      featured_facade_lead_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false
      },
      leads_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'leads',
          key: 'leads_id'
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
      featur_facade_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'featur_facade',
          key: 'featur_facade_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('featured_facade_lead', ['leads_id']);
    await queryInterface.addIndex('featured_facade_lead', ['featur_facade_id']);
    await queryInterface.addIndex('featured_facade_lead', ['company_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('featured_facade_lead');
  }
};
