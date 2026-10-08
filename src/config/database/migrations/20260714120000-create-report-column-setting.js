'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists('report_column_setting');
    if (tableExists) return;

    await queryInterface.createTable('report_column_setting', {
      report_column_setting_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'company', key: 'company_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      builder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'builder', key: 'builder_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // NULL user_id = the builder-wide default saved via "Apply to all users".
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'users_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      report_key: { type: Sequelize.STRING(60), allowNull: false },
      columns: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    // A user has at most one saved layout per report.
    await queryInterface.addIndex('report_column_setting', ['builder_id', 'user_id', 'report_key'], {
      name: 'report_column_setting_user_unique',
      unique: true,
      where: { user_id: { [Sequelize.Op.ne]: null } },
    });

    // A builder has at most one shared "apply to all" default per report
    // (user_id IS NULL). Postgres treats NULLs as distinct, so this partial
    // index enforces the single-default rule the plain composite index cannot.
    await queryInterface.addIndex('report_column_setting', ['builder_id', 'report_key'], {
      name: 'report_column_setting_builder_default_unique',
      unique: true,
      where: { user_id: null },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('report_column_setting');
  },
};
