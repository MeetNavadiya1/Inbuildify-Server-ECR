"use strict";

/**
 * Appointments use location_text only; drop FK column location_id.
 */
export default {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.appointment'::regclass
    AND c.contype = 'f'
    AND a.attname = 'location_id'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE appointment DROP CONSTRAINT %I', conname);
  END IF;
END$$;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE appointment DROP COLUMN IF EXISTS location_id;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE appointment
      ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES location(location_id) ON DELETE SET NULL;
    `);
  },
};
