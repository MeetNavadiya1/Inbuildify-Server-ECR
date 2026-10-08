'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('docusign_envelopes', {
      envelope_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()')
      },
      reference_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'Reference to quotation_version_id or agreement_id'
      },
      type: {
        type: Sequelize.ENUM('quotation', 'agreement'),
        allowNull: false
      },
      signer_email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      signer_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('created', 'sent', 'delivered', 'signed', 'completed', 'declined', 'voided'),
        allowNull: false,
        defaultValue: 'created'
      },
      signed_document_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      leads_id: {
        type: Sequelize.UUID,
        allowNull: true
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

    // Add indexes
    await queryInterface.addIndex('docusign_envelopes', ['reference_id']);
    await queryInterface.addIndex('docusign_envelopes', ['type']);
    await queryInterface.addIndex('docusign_envelopes', ['status']);
    await queryInterface.addIndex('docusign_envelopes', ['leads_id']);
    await queryInterface.addIndex('docusign_envelopes', ['envelope_id'], { unique: true });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('docusign_envelopes');
  }
};
