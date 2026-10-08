/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists('drive_activity_logs');
    if (tableExists) return;

    await queryInterface.createTable('drive_activity_logs', {
      log_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'company', key: 'company_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'users_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      action: {
        type: Sequelize.STRING,
        allowNull: false, // e.g. UPLOAD, DELETE, RENAME, MOVE, CREATE
      },
      entity_type: {
        type: Sequelize.STRING,
        allowNull: false, // FOLDER or FILE
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      entity_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      details: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('drive_activity_logs', ['company_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('drive_activity_logs');
  },
};
