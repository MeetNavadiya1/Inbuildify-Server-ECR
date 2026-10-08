'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists('drive_files');
    if (tableExists) {
      return; // Skip if it already exists
    }

    await queryInterface.createTable('drive_files', {
      file_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      folder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'drive',
          key: 'drive_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'company',
          key: 'company_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      builder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'builder',
          key: 'builder_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      uploaded_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'users_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      original_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      file_name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      s3_key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      mime_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      size: {
        type: Sequelize.BIGINT,
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
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists('drive_files');
    if (tableExists) {
      await queryInterface.dropTable('drive_files');
    }
  },
};
