/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Add file_extension column to drive_files
      const tableInfo = await queryInterface.describeTable('drive_files');
      if (!tableInfo.file_extension) {
        await queryInterface.addColumn('drive_files', 'file_extension', {
          type: Sequelize.STRING,
          allowNull: true
        }, { transaction });
      }

      const addIndexSafe = async (table, indexName, fields) => {
        const columns = fields.map(f => `"${f}"`).join(', ');
        await queryInterface.sequelize.query(
          `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" (${columns})`,
          { transaction }
        );
      };

      // 2. Add Indexes on drive table
      await addIndexSafe('drive', 'drive_company_id', ['company_id']);
        await addIndexSafe('drive', 'drive_parent_id', ['parent_id']);
        await addIndexSafe('drive', 'drive_deleted_at', ['deleted_at']);

      // 3. Add Indexes on drive_files table
      await addIndexSafe('drive_files', 'drive_files_company_id', ['company_id']);
      await addIndexSafe('drive_files', 'drive_files_folder_id', ['folder_id']);
      await addIndexSafe('drive_files', 'drive_files_deleted_at', ['deleted_at']);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tableInfo = await queryInterface.describeTable('drive_files');
      if (tableInfo.file_extension) {
        await queryInterface.removeColumn('drive_files', 'file_extension', { transaction });
      }

      await queryInterface.removeIndex('drive', ['company_id'], { transaction });
      await queryInterface.removeIndex('drive', ['parent_id'], { transaction });
      await queryInterface.removeIndex('drive', ['deleted_at'], { transaction });

      await queryInterface.removeIndex('drive_files', ['company_id'], { transaction });
      await queryInterface.removeIndex('drive_files', ['folder_id'], { transaction });
      await queryInterface.removeIndex('drive_files', ['deleted_at'], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
