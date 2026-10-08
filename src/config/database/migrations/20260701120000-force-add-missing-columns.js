"use strict";

/**
 * Migration to ensure missing columns on 'role' and 'job' tables are added.
 * This handles edge cases where existing databases might have skipped or rolled back
 * these specific columns but recorded the previous migrations as executed.
 * It uses IF NOT EXISTS to be perfectly idempotent.
 */
export async function up(queryInterface, Sequelize) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // Role table missing columns
    await queryInterface.sequelize.query(`ALTER TABLE "role" ADD COLUMN IF NOT EXISTS "company_id" UUID DEFAULT NULL;`, { transaction });
    await queryInterface.sequelize.query(`ALTER TABLE "role" ADD COLUMN IF NOT EXISTS "builder_id" UUID DEFAULT NULL;`, { transaction });
    await queryInterface.sequelize.query(`ALTER TABLE "role" ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT FALSE;`, { transaction });
    await queryInterface.sequelize.query(`ALTER TABLE "role" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT TRUE;`, { transaction });
    await queryInterface.sequelize.query(`ALTER TABLE "role" ADD COLUMN IF NOT EXISTS "can_view_own_permissions" BOOLEAN NOT NULL DEFAULT FALSE;`, { transaction });

    // Job table missing columns
    await queryInterface.sequelize.query(`ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "supervisor_id" UUID DEFAULT NULL REFERENCES "users"("users_id") ON DELETE SET NULL;`, { transaction });
    await queryInterface.sequelize.query(`ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "customer_contact_id" UUID DEFAULT NULL REFERENCES "users"("users_id") ON DELETE SET NULL;`, { transaction });

    // Appointment table missing columns
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
          CREATE TYPE "enum_appointment_status" AS ENUM('yes', 'No', 'May be');
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;
    `, { transaction });
    await queryInterface.sequelize.query(`ALTER TABLE "appointment" ADD COLUMN IF NOT EXISTS "status" "enum_appointment_status" DEFAULT 'No';`, { transaction });

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function down(queryInterface, Sequelize) {
  // Down migration left intentionally empty, as these columns are critical 
  // and were originally meant to be there. Dropping them could result in data loss.
}
