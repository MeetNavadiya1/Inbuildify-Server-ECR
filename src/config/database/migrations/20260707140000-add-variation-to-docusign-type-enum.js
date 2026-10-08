"use strict";

// Allow variation e-signature envelopes (docusign_envelopes.type = 'variation').
export default {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_docusign_envelopes_type" ADD VALUE IF NOT EXISTS 'variation';`,
    );
  },

  down: async () => {
    // PostgreSQL does not support removing values from an ENUM type.
  },
};
