'use strict';

export default {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_quotation_version_esign_status" ADD VALUE IF NOT EXISTS 'voided';`
    );
  },

  down: async () => {
    // PostgreSQL does not support removing values from an ENUM type
  }
};
