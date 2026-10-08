/**
 * Migration: add reference_id + reference_type to the drive (folder) table.
 *
 * Background
 * ----------
 * Drive folders were only ever company/builder-scoped, so a folder could not
 * be attached to a specific entity. The Job Documents tab now lets users create
 * their own folders (and upload files) *inside a job*. Those user folders are
 * stored as real Drive rows scoped to the job through these two columns
 * (reference_id = job_id, reference_type = 'Job'), mirroring how drive_files
 * already carry reference_id/reference_type.
 *
 * Because they carry a non-null reference_id, these job folders are filtered
 * out of the global Drive listing (getRootFoldersService adds reference_id IS
 * NULL) and only surface under their job's document tree.
 *
 * Both statements use IF NOT EXISTS so the migration is safe to re-run.
 */

export async function up(queryInterface) {
  await queryInterface.sequelize.query(`
    ALTER TABLE drive
      ADD COLUMN IF NOT EXISTS reference_id   UUID,
      ADD COLUMN IF NOT EXISTS reference_type VARCHAR(255);
  `);

  await queryInterface.sequelize.query(`
    CREATE INDEX IF NOT EXISTS drive_reference_idx
      ON drive (reference_id, reference_type);
  `);
}

export async function down(queryInterface) {
  await queryInterface.sequelize.query(`DROP INDEX IF EXISTS drive_reference_idx;`);
  await queryInterface.sequelize.query(`
    ALTER TABLE drive
      DROP COLUMN IF EXISTS reference_id,
      DROP COLUMN IF EXISTS reference_type;
  `);
}
