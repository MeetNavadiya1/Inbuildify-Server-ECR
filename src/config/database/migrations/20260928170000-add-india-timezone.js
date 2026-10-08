"use strict";

/**
 * Adds India Standard Time, so a company in India can pick its own timezone.
 *
 * India has a single timezone (IST, UTC+05:30, no daylight saving). A migration
 * rather than a seeder change alone because the timezone seeder only runs
 * against a freshly created database; `seed-timezones.js` carries the same row
 * for those.
 *
 * `timezones.timezone_name` has no unique constraint, so the insert is guarded
 * with NOT EXISTS rather than ON CONFLICT.
 */

const IST = {
  country_code: "IN",
  timezone_name: "Asia/Kolkata",
  display_name: "(GMT+05:30) India Standard Time",
  utc_offset_minutes: 330,
  is_dst: false,
};

export async function up(queryInterface) {
  await queryInterface.sequelize.query(
    `INSERT INTO timezones
       (timezone_id, country_code, timezone_name, display_name, utc_offset_minutes, is_dst, created_at, updated_at)
     SELECT gen_random_uuid(), :country_code, :timezone_name, :display_name, :utc_offset_minutes, :is_dst, NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM timezones WHERE timezone_name = :timezone_name)`,
    { replacements: IST },
  );
}

export async function down(queryInterface) {
  await queryInterface.sequelize.query("DELETE FROM timezones WHERE timezone_name = :timezone_name", {
    replacements: IST,
  });
}

export default { up, down };
