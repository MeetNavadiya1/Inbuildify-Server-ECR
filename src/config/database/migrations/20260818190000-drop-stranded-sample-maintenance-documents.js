"use strict";

/**
 * Remove the sample maintenance documents left pointing at nothing.
 *
 * The companion to `20260818180000-dedupe-sample-drive-files`, which could only
 * take the duplicates that carried no polymorphic reference at all. These carry
 * one — and it names a record that is not there.
 *
 * `cloneDriveFiles` recognised an already-imported file by
 * `(reference_id, reference_type, sub_reference_type)`, and a maintenance
 * document has no `sub_reference_type`: a site photo is `MaintenanceSiteImage`
 * with nothing under it, the attachment is plain `Maintenance`. So the check
 * never fired for them, and every sync cloned another copy. Meanwhile the sync
 * rebuilds the job tree — the maintenance itself is deleted and cloned afresh
 * under a new id — so each older copy was left naming a maintenance that had
 * since been thrown away. Three copies of one photo in My Drive, two of them
 * pointing into a hole.
 *
 * A file whose reference does not resolve is unambiguously waste: nothing can
 * reach it through the record it names, because that record is gone. Deleting
 * it leaves exactly the copy that still points at something — which is the copy
 * the maintenance gallery is actually reading.
 *
 * Both types key on `maintenance.maintenance_id`, which is what makes "does
 * this resolve?" a question this migration can answer honestly. It deliberately
 * does not generalise to the other reference types: `QuotationReport` and
 * `CompactionReport` both have a `sub_reference_type`, so the original check
 * covered them and they never duplicated — there is nothing here to fix and no
 * reason to go looking with a broader broom.
 *
 * Scoped to seeded rows. A document the builder attached to a maintenance
 * themselves is theirs, whatever state its reference is in.
 */

/** Reference types that hang off a maintenance and carry no sub-reference. */
const MAINTENANCE_REFERENCE_TYPES = ["Maintenance", "MaintenanceSiteImage"];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  const existing = new Set(await queryInterface.showAllTables());
  if (!existing.has("drive_files") || !existing.has("maintenance")) return;

  const [removed] = await sequelize.query(
    `DELETE FROM drive_files f
       WHERE f.is_sample_data = true
         AND f.reference_type IN (:types)
         AND f.reference_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM maintenance m WHERE m.maintenance_id = f.reference_id
         )
      RETURNING f.file_id, f.original_name`,
    { replacements: { types: MAINTENANCE_REFERENCE_TYPES } },
  );

  if (removed.length === 0) return;

  console.log(
    `[drop-stranded-sample-maintenance-documents] Removed ${removed.length} sample document(s) ` +
      "whose maintenance record no longer exists. Their S3 objects are now unreferenced.",
  );
}

/**
 * Nothing to undo. Every row removed named a maintenance record that does not
 * exist, so there is no state to restore it to.
 */
export async function down() {
  // Intentionally empty.
}

export default { up, down };
