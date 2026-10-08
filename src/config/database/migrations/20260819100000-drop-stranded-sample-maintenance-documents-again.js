"use strict";

/**
 * Sweep the stranded sample maintenance documents a second time, and take the
 * task attachments the first sweep left behind.
 *
 * `20260818190000-drop-stranded-sample-maintenance-documents` cleared the state
 * the duplication bug had produced up to the moment it ran. It did not stop the
 * bug: `cloneDriveDocuments` still recognised an already-imported document only
 * by the reference it maps to THIS run, and a sync rebuilds the job tree —
 * `deleteSampleJobTrees` destroys the cloned maintenance and `cloneChildRows`
 * recreates it under a fresh id — so the copies from earlier runs never matched
 * and another one was written every time. Every sync run after that migration
 * stranded a fresh set. The helper now identifies a document by folder, name and
 * size and repoints the copy that stays, so no further ones are made; this is
 * what the syncs in between left.
 *
 * Two differences from the first sweep:
 *
 *   1. `MaintenanceTaskAttachment` is included. Its files hang off a
 *      `maintenance_request_task`, which the same rebuild recreates, so they
 *      duplicated exactly as the other two did — the first sweep simply did not
 *      name the type.
 *   2. A document is only removed when its group still has a copy that resolves.
 *      Deleting the last trace of a record would empty the Documents tab
 *      outright, which is worse than a document nobody can reach; the surviving
 *      copy is the one the next sync repoints.
 *
 * A file whose reference does not resolve is otherwise unambiguously waste:
 * nothing can reach it through the record it names, because that record is gone.
 *
 * Scoped to seeded rows and to live ones. A document the builder attached
 * themselves is theirs whatever state its reference is in, and a copy they went
 * out of their way to bin is not this migration's to empty.
 */

/**
 * Reference types that hang off the maintenance tree, and the table each one's
 * `reference_id` names. All three are recreated under new ids by a sync.
 */
const MAINTENANCE_REFERENCES = [
  { type: "Maintenance", table: "maintenance", pk: "maintenance_id" },
  { type: "MaintenanceSiteImage", table: "maintenance", pk: "maintenance_id" },
  {
    type: "MaintenanceTaskAttachment",
    table: "maintenance_request_task",
    pk: "maintenance_request_task_id",
  },
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const TAG = "[drop-stranded-sample-maintenance-documents-again]";
  const { sequelize } = queryInterface;

  const existing = new Set(await queryInterface.showAllTables());
  if (!existing.has("drive_files")) return;

  const targets = MAINTENANCE_REFERENCES.filter((ref) => existing.has(ref.table));
  if (targets.length === 0) return;

  let total = 0;

  for (const { type, table, pk } of targets) {
    // `keepers` is the reason this is one statement per type rather than one
    // for all three: a group is only safe to thin once something in it still
    // resolves, and "resolves" is a different table per type.
    const [removed] = await sequelize.query(
      `
      WITH candidates AS (
        SELECT f."file_id",
               f."company_id",
               f."folder_id",
               f."sample_data_owner_id",
               f."original_name",
               f."size",
               EXISTS (
                 SELECT 1 FROM "${table}" r WHERE r."${pk}" = f."reference_id"
               ) AS resolves
          FROM "drive_files" f
         WHERE f."is_sample_data" = true
           AND f."deleted_at" IS NULL
           AND f."reference_type" = :type
           AND f."reference_id" IS NOT NULL
      ),
      keepers AS (
        SELECT "company_id", "folder_id", "sample_data_owner_id", "original_name", "size"
          FROM candidates
         WHERE resolves
         GROUP BY 1, 2, 3, 4, 5
      )
      DELETE FROM "drive_files"
       WHERE "file_id" IN (
         SELECT c."file_id"
           FROM candidates c
           JOIN keepers k
             ON k."company_id"            IS NOT DISTINCT FROM c."company_id"
            AND k."folder_id"             IS NOT DISTINCT FROM c."folder_id"
            AND k."sample_data_owner_id"  IS NOT DISTINCT FROM c."sample_data_owner_id"
            AND k."original_name"         IS NOT DISTINCT FROM c."original_name"
            AND k."size"                  IS NOT DISTINCT FROM c."size"
          WHERE NOT c.resolves
       )
      RETURNING "file_id", "s3_key"
      `,
      { replacements: { type } },
    );

    if (removed.length > 0) {
      console.log(`${TAG} ${type}: removed ${removed.length} stranded copy(ies)`);
      total += removed.length;
    }
  }

  if (total === 0) {
    console.log(`${TAG} no stranded sample maintenance documents — nothing to do`);
    return;
  }

  // The S3 objects behind the removed rows are left where they are: a migration
  // has no S3 client, and an unreferenced object costs storage where a wrongly
  // deleted one costs a document.
  console.log(
    `${TAG} removed ${total} sample document(s) whose maintenance record no longer ` +
      "exists; their S3 objects are now unreferenced and can be swept separately.",
  );
}

/**
 * Nothing to undo. Every row removed named a record that does not exist and had
 * a byte-identical sibling that does, so there is no state to restore it to.
 */
export async function down() {
  // Intentionally empty.
}

export default { up, down };
