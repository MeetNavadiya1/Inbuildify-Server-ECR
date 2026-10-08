"use strict";

/**
 * For databases that already ran the earlier version of
 * 20260410191000-set-leads-created-at-default-now (defaults only, no NOT NULL).
 * Idempotent: safe if timestamps are already constrained.
 */
export default {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE leads
      SET created_at = CURRENT_TIMESTAMP
      WHERE created_at IS NULL;
    `);
    await queryInterface.sequelize.query(`
      UPDATE leads
      SET updated_at = CURRENT_TIMESTAMP
      WHERE updated_at IS NULL;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE leads
      ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
      ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE leads ALTER COLUMN created_at SET NOT NULL;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE leads ALTER COLUMN updated_at SET NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE leads
      ALTER COLUMN created_at DROP NOT NULL,
      ALTER COLUMN updated_at DROP NOT NULL;
    `);
  },
};
