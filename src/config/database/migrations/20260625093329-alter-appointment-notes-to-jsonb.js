'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    // Using raw query to handle the data transformation from STRING to JSONB.
    // If the old note is null or empty, it becomes an empty JSON array '[]'.
    // Otherwise, it wraps the existing string note into a JSON array.
    await queryInterface.sequelize.query(`
      ALTER TABLE "appointment"
      ALTER COLUMN "notes" TYPE jsonb
      USING CASE
        WHEN "notes" IS NULL OR BTRIM("notes"::text) = '' THEN '[]'::jsonb
        -- If it's already a JSON array string (starts with [), try casting it directly, otherwise wrap in array
        WHEN BTRIM("notes"::text) LIKE '[%]' THEN "notes"::jsonb
        ELSE jsonb_build_array("notes")
      END;
    `);

    // Set the default value to an empty array
    await queryInterface.changeColumn('appointment', 'notes', {
      type: Sequelize.JSONB,
      defaultValue: [],
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Attempt to extract the first string if it was an array
    await queryInterface.sequelize.query(`
      ALTER TABLE "appointment"
      ALTER COLUMN "notes" TYPE varchar(255)
      USING CASE
        WHEN jsonb_typeof("notes") = 'array' AND jsonb_array_length("notes") > 0 THEN "notes"->>0
        WHEN jsonb_typeof("notes") = 'string' THEN "notes"->>0
        ELSE NULL
      END;
    `);

    // Revert the default value and column type back to STRING(255)
    await queryInterface.changeColumn('appointment', 'notes', {
      type: Sequelize.STRING(255),
      allowNull: true,
      defaultValue: null,
    });
  }
};
