import db, { initModels } from "../config/database/models/postgre-models/index.js";

/**
 * Timezone seeding logic.
 */
export const seedTimezones = async () => {
  try {
    console.log("🌱 Starting timezone seeding...");

    // Initialize Sequelize models
    await initModels();
    const { Timezones } = db;

    const data = [
      { country_code: "AU", timezone_name: "Australia/Hobart", display_name: "(GMT+10:00) Hobart", utc_offset_minutes: 600, is_dst: true },
      { country_code: "AU", timezone_name: "Australia/Adelaide", display_name: "(GMT+09:30) Adelaide", utc_offset_minutes: 570, is_dst: true },
      { country_code: "AU", timezone_name: "Australia/Melbourne", display_name: "(GMT+10:00) Melbourne", utc_offset_minutes: 600, is_dst: true },
      { country_code: "AU", timezone_name: "Australia/Sydney", display_name: "(GMT+10:00) Sydney", utc_offset_minutes: 600, is_dst: true },
      { country_code: "AU", timezone_name: "Australia/Darwin", display_name: "(GMT+09:30) Darwin", utc_offset_minutes: 570, is_dst: false },
      { country_code: "AU", timezone_name: "Australia/Perth", display_name: "(GMT+08:00) Perth", utc_offset_minutes: 480, is_dst: false },
      { country_code: "AU", timezone_name: "Australia/Canberra", display_name: "(GMT+10:00) Canberra", utc_offset_minutes: 600, is_dst: true },
      { country_code: "AU", timezone_name: "Australia/Lord_Howe", display_name: "(GMT+10:30) Lord Howe Isla..", utc_offset_minutes: 630, is_dst: true },
      { country_code: "AU", timezone_name: "Australia/Brisbane", display_name: "(GMT+10:00) Brisbane", utc_offset_minutes: 600, is_dst: false },
      // India has one timezone. Also added to existing databases by migration 20260928170000-add-india-timezone.
      { country_code: "IN", timezone_name: "Asia/Kolkata", display_name: "(GMT+05:30) India Standard Time", utc_offset_minutes: 330, is_dst: false },
    ];

    for (const tz of data) {
      const [timezone, created] = await Timezones.findOrCreate({
        where: { timezone_name: tz.timezone_name },
        defaults: tz,
      });

      if (created) {
        console.log(`✅ Created timezone: ${tz.timezone_name}`);
      } else {
        // Update if already exists to ensure data matches
        await timezone.update(tz);
        console.log(`ℹ️ Updated timezone: ${tz.timezone_name}`);
      }
    }

    console.log("✅ Timezone seeding completed.");
  } catch (error) {
    console.error("❌ Timezone seeding failed:", error);
    throw error;
  }
};

// Check if run directly
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")) || process.argv[1].endsWith("seed-timezones.js"))) {
  seedTimezones()
    .catch((err) => console.error(err))
    .finally(async () => {
      if (db.sequelize) {
        await db.sequelize.close();
      }
      process.exit(0);
    });
}

export default seedTimezones;
