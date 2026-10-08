export async function up(queryInterface) {
  try {
    // Delete any orphaned records in featured_facade_lead that point to a non-existent lead
    // This prevents Sequelize sync() from crashing when it tries to apply the foreign key constraint.
    await queryInterface.sequelize.query(`
      DELETE FROM "featured_facade_lead" 
      WHERE "leads_id" NOT IN (SELECT "leads_id" FROM "leads");
    `);
  } catch (error) {
    console.log("Migration (up): Clean orphans skipped or failed.", error.message);
  }
}

export async function down() {
  // Cannot restore deleted orphaned records
  console.log("Migration (down): Nothing to revert for orphaned data cleanup.");
}
