/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tableInfo = await queryInterface.describeTable('drive_files');

      if (!tableInfo.lead_id) {
        await queryInterface.addColumn('drive_files', 'lead_id', {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'leads',
            key: 'leads_id',
          },
          onDelete: 'CASCADE',
        }, { transaction });
      }

      if (!tableInfo.reference_id) {
        await queryInterface.addColumn('drive_files', 'reference_id', {
          type: Sequelize.UUID,
          allowNull: true,
        }, { transaction });
      }

      if (!tableInfo.reference_id_name) {
        await queryInterface.addColumn('drive_files', 'reference_id_name', {
          type: Sequelize.STRING,
          allowNull: true,
        }, { transaction });
      }

      if (!tableInfo.sub_reference_id) {
        await queryInterface.addColumn('drive_files', 'sub_reference_id', {
          type: Sequelize.UUID,
          allowNull: true,
        }, { transaction });
      }

      if (!tableInfo.sub_reference) {
        await queryInterface.addColumn('drive_files', 'sub_reference', {
          type: Sequelize.STRING,
          allowNull: true,
        }, { transaction });
      }

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

      if (tableInfo.lead_id) await queryInterface.removeColumn('drive_files', 'lead_id', { transaction });
      if (tableInfo.reference_id) await queryInterface.removeColumn('drive_files', 'reference_id', { transaction });
      if (tableInfo.reference_id_name) await queryInterface.removeColumn('drive_files', 'reference_id_name', { transaction });
      if (tableInfo.sub_reference_id) await queryInterface.removeColumn('drive_files', 'sub_reference_id', { transaction });
      if (tableInfo.sub_reference) await queryInterface.removeColumn('drive_files', 'sub_reference', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
