/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists('drive_file_versions');
    if (tableExists) return;

    await queryInterface.createTable('drive_file_versions', {
      version_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      file_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'drive_files', key: 'file_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'company', key: 'company_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      version_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      s3_key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      file_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      size: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      mime_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      uploaded_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'users_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
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

    // Indexes for fast version history lookup
    await queryInterface.addIndex('drive_file_versions', ['file_id']);
    await queryInterface.addIndex('drive_file_versions', ['company_id']);
    await queryInterface.addIndex('drive_file_versions', ['file_id', 'version_number'], {
      name: 'idx_file_version_number',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('drive_file_versions');
  },
};
