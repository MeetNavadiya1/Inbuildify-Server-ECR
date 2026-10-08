"use strict";

/**
 * Free-text appointment location (optional).
 * Idempotent: safe if column already exists.
 */
export default {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE appointment ADD COLUMN IF NOT EXISTS location_text VARCHAR(500);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE appointment DROP COLUMN IF EXISTS location_text;
    `);
  },
};
