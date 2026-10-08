'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('quotation_version');

    if (!table.esign_status) {
      await queryInterface.addColumn('quotation_version', 'esign_status', {
        type: Sequelize.ENUM('pending', 'sent', 'signed', 'completed', 'declined', 'voided'),
        allowNull: true,
        defaultValue: null
      });
    }

    if (!table.esign_envelope_id) {
      await queryInterface.addColumn('quotation_version', 'esign_envelope_id', {
        type: Sequelize.UUID,
        allowNull: true
      });
    }

    if (!table.signed_pdf_url) {
      await queryInterface.addColumn('quotation_version', 'signed_pdf_url', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

    try {
      await queryInterface.addIndex('quotation_version', ['esign_status']);
    } catch (e) {
      console.log('Index for esign_status might already exist, skipping...');
    }

    try {
      await queryInterface.addIndex('quotation_version', ['esign_envelope_id']);
    } catch (e) {
      console.log('Index for esign_envelope_id might already exist, skipping...');
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('quotation_version', ['esign_status']);
    await queryInterface.removeIndex('quotation_version', ['esign_envelope_id']);
    await queryInterface.removeColumn('quotation_version', 'esign_status');
    await queryInterface.removeColumn('quotation_version', 'esign_envelope_id');
    await queryInterface.removeColumn('quotation_version', 'signed_pdf_url');
  }
};
