'use strict';

export const up = async (queryInterface, Sequelize) => {
    try { await queryInterface.dropTable('activity_logs'); } catch (e) {}
    await queryInterface.createTable('activity_logs', {
      activity_log_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'company',
          key: 'company_id',
        },
        onDelete: 'CASCADE',
      },
      builder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'builder',
          key: 'builder_id',
        },
        onDelete: 'CASCADE',
      },
      reference_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      reference_type: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      sub_reference_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      sub_reference_type: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'users_id',
        },
        onDelete: 'SET NULL',
      },
      module: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      module_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      action: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      record_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      field_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      old_value: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      new_value: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex('activity_logs', ['company_id'], { name: 'idx_act_logs_company_id' });
    await queryInterface.addIndex('activity_logs', ['builder_id'], { name: 'idx_act_logs_builder_id' });
    await queryInterface.addIndex('activity_logs', ['reference_id', 'reference_type', 'created_at'], { name: 'idx_act_logs_ref' });
    await queryInterface.addIndex('activity_logs', ['sub_reference_id', 'sub_reference_type'], { name: 'idx_act_logs_sub_ref' });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('activity_logs');
};
