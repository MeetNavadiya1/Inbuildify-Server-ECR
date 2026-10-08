import db, { initModels } from "../config/database/models/postgre-models/index.js";
import { getStateNames } from "../modules/city/city.data.js";

/**
 * Core country/state seeding logic.
 */
export const seedCountriesAndStates = async () => {
  try {
    console.log("🌱 Starting country/state seeding...");

    // Initialize Sequelize models
    await initModels();
    const { Country, State } = db;

    // The supported countries' states come from the same data the city API and
    // the save-time check use, so the three cannot drift apart.
    const data = {
      australia: { states: getStateNames("australia") },
      india: { states: getStateNames("india") },
      singapore: {
        states: [
          "central singapore",
          "north singapore",
          "north-east singapore",
          "east singapore",
          "west singapore",
        ],
      },
    };

    for (const [countryName, details] of Object.entries(data)) {
      const [country, countryCreated] = await Country.findOrCreate({
        where: { name: countryName },
        defaults: {},
      });

      if (countryCreated) {
        console.log(`✅ Created country: ${countryName}`);
      } else {
        console.log(`ℹ️ Country already exists: ${countryName}`);
      }

      for (const stateName of details.states) {
        const [state, stateCreated] = await State.findOrCreate({
          where: { name: stateName, country_id: country.country_id },
          defaults: {},
        });

        if (stateCreated) {
          console.log(`   ✅ Created state: ${stateName}`);
        } else {
          console.log(`   ℹ️ State already exists: ${stateName}`);
        }
      }
    }

    console.log("✅ Countries and states seeding completed.");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  }
};

// Check if run directly
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")))) {
  seedCountriesAndStates()
    .catch((err) => console.error(err))
    .finally(async () => {
      if (db.sequelize) {
        await db.sequelize.close();
      }
      process.exit(0);
    });
}

export default { seedCountriesAndStates };
