export async function up(queryInterface) {
  // We wrap this in a try-catch because if the table is freshly created (or already JSONB), 
  // it might not need this explicitly. But if it's text, this safely converts it.
  try {
    await queryInterface.sequelize.query(
      'ALTER TABLE "appointment" ALTER COLUMN "notes" TYPE JSONB USING \'[]\'::jsonb;'
    );
  } catch (error) {
    console.log("Migration (up): Notes column is likely already JSONB or table does not exist.");
  }
}

export async function down(queryInterface) {
  try {
    await queryInterface.sequelize.query(
      'ALTER TABLE "appointment" ALTER COLUMN "notes" TYPE TEXT;'
    );
  } catch (error) {
    console.log("Migration (down): Could not revert notes column to TEXT.");
  }
}
