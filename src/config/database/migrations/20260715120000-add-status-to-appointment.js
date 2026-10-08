"use strict";

/**
 * Adds appointment.status. The equivalent statement in
 * 20260701120000-force-add-missing-columns.js is unreachable on databases that
 * recorded that migration before the appointment block was appended to it.
 */
export default {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
DO $$ BEGIN
  CREATE TYPE "enum_appointment_status" AS ENUM('yes', 'No', 'May be');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "appointment"
      ADD COLUMN IF NOT EXISTS "status" "enum_appointment_status" NOT NULL DEFAULT 'No';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "appointment" DROP COLUMN IF EXISTS "status";
    `);
  },
};
