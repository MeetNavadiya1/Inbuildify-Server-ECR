'use strict';

export default {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('house_land_package');

    if (tableInfo.attach_files && tableInfo.attach_files.type !== 'JSONB') {
      // Sequelize changeColumn for Postgres doesn't natively support the USING clause.
      // We use a raw query for the type conversion to ensure data integrity during the cast.
      await queryInterface.sequelize.query(`
        ALTER TABLE "house_land_package" 
        ALTER COLUMN "attach_files" TYPE JSONB USING (
          CASE 
            WHEN attach_files IS NULL OR attach_files = '' THEN '[]'::jsonb
            ELSE attach_files::jsonb 
          END
        )
      `);

      // Use changeColumn for the rest of the attributes (default value, nullability)
      await queryInterface.changeColumn('house_land_package', 'attach_files', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('house_land_package', 'attach_files', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null
    });
  }
};
