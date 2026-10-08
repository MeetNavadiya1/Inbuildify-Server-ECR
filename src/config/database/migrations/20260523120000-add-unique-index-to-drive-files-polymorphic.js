/**
 * Enforce one active DriveFile per polymorphic reference.
 *
 * Duplicate active rows (deleted_at IS NULL) were being created for the same
 * (reference_id, reference_type, sub_reference_type) tuple — e.g. two
 * `QuotationReport` rows for one QuotationVersion when the PDF-generation and
 * email workers raced. An application-level advisory lock was the only guard,
 * which is not a real guarantee. This migration:
 *   1. Soft-deletes existing duplicate active rows, keeping the most recently
 *      updated row per tuple.
 *   2. Adds a PARTIAL UNIQUE INDEX so the database itself rejects a second
 *      active row for the same tuple.
 *
 * The index is partial on `deleted_at IS NULL` so that paranoid soft-deletes
 * (which keep the old row around with deleted_at set) never collide with a new
 * active row for the same reference.
 *
 * @type {import('sequelize-cli').Migration}
 */
const INDEX_NAME = "drive_files_polymorphic_active_unique";

export default {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. De-duplicate existing active rows: keep the newest per tuple,
      //    soft-delete the rest. Tie-break on updated_at, then created_at,
      //    then file_id for determinism.
      await queryInterface.sequelize.query(
        `
        WITH ranked AS (
          SELECT
            file_id,
            ROW_NUMBER() OVER (
              PARTITION BY reference_id, reference_type, sub_reference_type
              ORDER BY updated_at DESC NULLS LAST,
                       created_at DESC NULLS LAST,
                       file_id DESC
            ) AS rn
          FROM drive_files
          WHERE deleted_at IS NULL
            AND reference_id IS NOT NULL
            AND reference_type IS NOT NULL
            AND sub_reference_type IS NOT NULL
        )
        UPDATE drive_files df
        SET deleted_at = NOW()
        FROM ranked
        WHERE df.file_id = ranked.file_id
          AND ranked.rn > 1;
        `,
        { transaction },
      );

      // 2. Partial unique index guaranteeing a single active row per tuple.
      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME}
        ON drive_files (reference_id, reference_type, sub_reference_type)
        WHERE deleted_at IS NULL
          AND reference_id IS NOT NULL
          AND reference_type IS NOT NULL
          AND sub_reference_type IS NOT NULL;
        `,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    // Only the index is reversible; the soft-deleted duplicates are not restored.
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${INDEX_NAME};`);
  },
};
