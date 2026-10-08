"use strict";

/**
 * Adds India and its 28 states and 8 union territories.
 *
 * A migration rather than a seeder change alone because the country/state
 * seeder only runs against a freshly created database — every existing one
 * would never get India otherwise.
 *
 * Names are lower-case like the existing rows, and must stay in step with the
 * India keys in `modules/city/city.data.js`, which holds each state's cities.
 *
 * Idempotent: ON CONFLICT DO NOTHING against the unique country name and the
 * unique (country_id, name) pair, so a database that already has some or all
 * of these rows is left as it is.
 */

const COUNTRY = "india";

const STATES = [
  // States
  "andhra pradesh",
  "arunachal pradesh",
  "assam",
  "bihar",
  "chhattisgarh",
  "goa",
  "gujarat",
  "haryana",
  "himachal pradesh",
  "jharkhand",
  "karnataka",
  "kerala",
  "madhya pradesh",
  "maharashtra",
  "manipur",
  "meghalaya",
  "mizoram",
  "nagaland",
  "odisha",
  "punjab",
  "rajasthan",
  "sikkim",
  "tamil nadu",
  "telangana",
  "tripura",
  "uttar pradesh",
  "uttarakhand",
  "west bengal",
  // Union territories
  "andaman and nicobar islands",
  "chandigarh",
  "dadra and nagar haveli and daman and diu",
  "delhi",
  "jammu and kashmir",
  "ladakh",
  "lakshadweep",
  "puducherry",
];

export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  await sequelize.transaction(async (transaction) => {
    // Timestamps are written explicitly: a table created by sequelize.sync()
    // has no database default for them.
    await sequelize.query(
      `INSERT INTO country (country_id, name, created_at, updated_at)
       VALUES (gen_random_uuid(), :name, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      { replacements: { name: COUNTRY }, transaction },
    );

    await sequelize.query(
      `INSERT INTO state (state_id, name, country_id, created_at, updated_at)
       SELECT gen_random_uuid(), s.name, c.country_id, NOW(), NOW()
         FROM country c
        CROSS JOIN unnest(ARRAY[:states]::varchar[]) AS s(name)
        WHERE c.name = :name
       ON CONFLICT DO NOTHING`,
      { replacements: { name: COUNTRY, states: STATES }, transaction },
    );
  });
}

export async function down(queryInterface) {
  // The states cascade from the country. Rows that point at either follow their
  // own table's FK rule (address uses SET NULL), so roll back only before any
  // Indian address has been saved.
  await queryInterface.sequelize.query("DELETE FROM country WHERE name = :name", {
    replacements: { name: COUNTRY },
  });
}

export default { up, down };
