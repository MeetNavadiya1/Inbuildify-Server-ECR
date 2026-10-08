export async function up(queryInterface) {
  try {
    // Delete any orphaned records in job_process_task that point to a non-existent user
    // This prevents Sequelize sync() from crashing when it tries to apply the foreign key constraint.
    await queryInterface.sequelize.query(`
      DELETE FROM "job_process_task" 
      WHERE "assignee_id" IS NOT NULL 
        AND "assignee_id" NOT IN (SELECT "users_id" FROM "users");
    `);
  } catch (error) {
    console.log("Migration (up): Clean orphans skipped or failed.", error.message);
  }
}

export async function down() {
  console.log("Migration (down): Nothing to revert for orphaned data cleanup.");
}
