"use strict";

/**
 * Collapse the duplicate S Drive files a sync left behind.
 *
 * `cloneDriveFiles` recognised a file it had already brought across by its
 * polymorphic reference — `(reference_id, reference_type, sub_reference_type)`.
 * A file missing any part of that triple arrived at the check unrecognisable and
 * was cloned again, and a sync re-runs that pass over the whole source every
 * time. Two kinds of file are affected: those the demo account never gave a
 * `sub_reference_type` (maintenance attachments and site images), and those
 * whose reference could not be remapped into this company, which have it
 * dropped on purpose. `ensureUniqueDriveFileName` filed each new copy as `-2`,
 * `-3`, `-4`, so nothing ever collided and nothing ever complained — My Drive
 * simply grew another copy of the same document per sync.
 *
 * The helper now also identifies a file by folder, name and size, so no further
 * copies are made. The copies already made are what this removes.
 *
 * Narrow on purpose. Only rows that are all of:
 *
 *   - seeded — the builder's own uploads are not this migration's business;
 *   - carrying no polymorphic reference, so nothing in the application points
 *     at them and removing one cannot strand a record;
 *   - filed in a My Drive folder rather than an entity's Documents tree;
 *   - live, not in Trash. A binned copy may have been binned deliberately, and
 *     quietly emptying somebody's Trash is not a fix. The helper counts Trash
 *     when deciding what to clone, so nothing removed here comes back.
 *
 * Within a group — same company, same folder, same owner, same name, same byte
 * count — the earliest row is kept and the rest go. They are byte-identical
 * copies of one document, so which one survives matters only for its id.
 *
 * The `SET NULL` foreign keys into `drive_files` (a floor plan's image, a
 * quotation version's report, a job's colour document) make deleting a
 * referenced row a silent way to blank a column somewhere else. None of the
 * candidates is referenced — they have no polymorphic reference, and the clone
 * that fills those columns always sets one — but the exclusion is spelled out
 * rather than relied upon, because the cost of being wrong is a floor plan that
 * loses its drawing.
 *
 * The S3 objects behind the removed rows are left where they are. A migration
 * has no S3 client, and an unreferenced object costs storage; a deleted object
 * that turned out to be referenced costs a document. The count is logged.
 */

/** Columns that point AT a drive file and are nulled if their target is deleted. */
const FK_COLUMNS = [
  ["building_contracts", "pdf_file_id"],
  ["facade", "image"],
  ["floor_plan", "detailed_image"],
  ["floor_plan", "simple_image"],
  ["job", "color_document"],
  ["job", "color_report"],
  ["job_variation", "invoice_document"],
  ["job_variation", "signed_document"],
  ["property_detail", "compaction_report_url"],
  ["quotation_version", "quotation_version_detail"],
  ["quotation_version", "structure_engineer_report"],
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  const existing = new Set(await queryInterface.showAllTables());
  if (!existing.has("drive_files") || !existing.has("drive")) return;

  const pinned = FK_COLUMNS
    .filter(([table]) => existing.has(table))
    .map(([table, column]) => `SELECT "${column}" AS file_id FROM "${table}" WHERE "${column}" IS NOT NULL`)
    .join("\n      UNION\n      ");

  const [removed] = await sequelize.query(`
    WITH ranked AS (
      SELECT f.file_id,
             f.s3_key,
             row_number() OVER (
               PARTITION BY f.company_id, f.folder_id, f.sample_data_owner_id,
                            f.original_name, f.size
               ORDER BY f.created_at, f.file_id
             ) AS copy_number
        FROM drive_files f
        JOIN drive d ON d.drive_id = f.folder_id
       WHERE f.is_sample_data = true
         AND f.deleted_at IS NULL
         AND f.reference_id IS NULL
         AND f.reference_type IS NULL
         AND f.sub_reference_type IS NULL
         AND d.reference_id IS NULL
    ),
    surplus AS (
      SELECT file_id, s3_key FROM ranked WHERE copy_number > 1
       ${pinned ? `AND file_id NOT IN (\n         ${pinned}\n       )` : ""}
    )
    DELETE FROM drive_files
     WHERE file_id IN (SELECT file_id FROM surplus)
    RETURNING file_id, s3_key
  `);

  if (removed.length === 0) return;

  const orphanedObjects = removed.filter((row) => row.s3_key).length;

  console.log(
    `[dedupe-sample-drive-files] Removed ${removed.length} duplicate sample document(s) ` +
      `from My Drive; ${orphanedObjects} S3 object(s) are now unreferenced and can be ` +
      "swept separately.",
  );
}

/**
 * Nothing to undo. The rows removed were byte-identical copies of ones that are
 * still there, and which id belonged to which copy is not recorded.
 */
export async function down() {
  // Intentionally empty.
}

export default { up, down };
