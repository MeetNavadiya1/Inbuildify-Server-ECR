"use strict";

/**
 * One folder per name per place in the drive, enforced by the database.
 *
 * My Drive was showing the generated report buckets several times over —
 * "Colour Selection Reports" four times, "Compaction Reports" four times — each
 * copy with its own timestamp. Nothing was cloning folders on purpose. Five
 * different code paths each ran their own `Drive.findOrCreate`, and
 * `findOrCreate` is only atomic when a unique constraint backs it. There was
 * none on `drive`, so:
 *
 *   • two writers inside separate transactions both SELECT, neither sees the
 *     other's uncommitted INSERT, and both insert — the copies sharing a
 *     timestamp;
 *   • the report helpers stamped `builder_id` from whichever lead triggered the
 *     first PDF while the sample-data import stamped the target account's, so
 *     the same bucket existed once per builder and a Company Administrator (no
 *     builder_id, so no builder filter) saw them all at once;
 *   • `drive` is paranoid, so a bucket sitting in Trash was invisible to the
 *     find and the next write created a live twin beside it.
 *
 * This migration merges what is already there and then makes the key real:
 *
 *   1. The generated buckets at the drive root become company-level
 *      (builder_id NULL), which is what they always described. `tenantWhere` in
 *      drive.service keeps them visible to builder-scoped users.
 *   2. Duplicates collapse onto the oldest row of each group — files and
 *      sub-folders are repointed at the keeper before the losers are dropped,
 *      so nothing filed under a duplicate is lost. Repeated until stable,
 *      because repointing a parent can bring two sub-folders together.
 *   3. A partial unique index on (tenant, parent, reference, folded name) for
 *      live rows. From here on the database rejects the second insert and the
 *      shared resolver in `driveFolder.helper` re-reads the winner.
 *
 * Trashed rows are left exactly as they are: the index is partial on
 * `deleted_at IS NULL`, so someone's Trash never blocks a new folder, and
 * merging things a user has already thrown away would only surprise them.
 */

const INDEX_NAME = "drive_folder_active_unique";

/** Stands in for NULL in the key — in SQL, NULL never equals NULL. */
const NIL = "'00000000-0000-0000-0000-000000000000'::uuid";

/**
 * The identity two folder rows must share to be the same folder. Name is folded
 * (trimmed, lower-cased) so " Compaction Reports" cannot sit beside
 * "Compaction reports".
 */
const KEY_COLUMNS = `
  (COALESCE("company_id", ${NIL})),
  (COALESCE("builder_id", ${NIL})),
  (COALESCE("parent_id", ${NIL})),
  (COALESCE("reference_id", ${NIL})),
  (COALESCE("reference_type", '')),
  (lower(btrim("name")))
`;

/** Names the report helpers create on demand — kept in sync with constants/driveFile.js. */
const SYSTEM_FOLDER_NAMES = [
  "Quotation Reports",
  "Engineering Requirements",
  "Structure Engineer Reports",
  "Compaction Reports",
  "Building Contracts",
  "Colour Selection Reports",
  "Colour Schedule Documents",
];

/** Guard against a runaway loop if the data somehow never settles. */
const MAX_PASSES = 10;

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const TAG = "[dedupe-drive-folders]";
  const { sequelize } = queryInterface;

  // Shares arrived in their own migration; tolerate a database that predates it.
  const sharesTable = await queryInterface.tableExists("drive_shares");

  const transaction = await sequelize.transaction();
  try {
    // 1. The generated buckets belong to the company, not to one builder.
    //    Only untouched system folders at the drive root qualify: a folder with
    //    a parent, or one attached to a job or lead, keeps its builder.
    const [, unstamped] = await sequelize.query(
      `
      UPDATE "drive"
         SET "builder_id" = NULL
       WHERE "builder_id" IS NOT NULL
         AND "parent_id" IS NULL
         AND "reference_id" IS NULL
         AND "deleted_at" IS NULL
         AND btrim("name") IN (:names);
      `,
      { replacements: { names: SYSTEM_FOLDER_NAMES }, transaction },
    );
    console.log(`${TAG} System buckets made company-level: ${unstamped?.rowCount ?? 0}`);

    // 2. Collapse each group onto its oldest row.
    let totals = { merged: 0, files: 0, children: 0 };
    let settled = false;

    for (let pass = 1; pass <= MAX_PASSES && !settled; pass += 1) {
      await sequelize.query("DROP TABLE IF EXISTS \"drive_folder_dupes\";", { transaction });
      await sequelize.query(
        `
        CREATE TEMP TABLE "drive_folder_dupes" AS
        WITH ranked AS (
          SELECT
            "drive_id",
            first_value("drive_id") OVER (
              PARTITION BY ${KEY_COLUMNS}
              ORDER BY "created_at" ASC NULLS LAST, "drive_id" ASC
            ) AS keeper_id
          FROM "drive"
          WHERE "deleted_at" IS NULL
        )
        SELECT "drive_id", keeper_id FROM ranked WHERE "drive_id" <> keeper_id;
        `,
        { transaction },
      );

      const [[{ count }]] = await sequelize.query(
        "SELECT count(*)::int AS count FROM \"drive_folder_dupes\";",
        { transaction },
      );
      if (count === 0) {
        if (pass === 1) {
          console.log(`${TAG} No duplicate folders found.`);
        }
        settled = true;
        continue;
      }

      // Files and sub-folders move to the keeper BEFORE the losers go. Both FKs
      // are ON DELETE CASCADE, so deleting first would take the contents with
      // it. No paranoid filter here on purpose — something in Trash still has to
      // follow its folder, or restoring it later would land it nowhere.
      const [, movedFiles] = await sequelize.query(
        `
        UPDATE "drive_files" f
           SET "folder_id" = d.keeper_id
          FROM "drive_folder_dupes" d
         WHERE f."folder_id" = d."drive_id";
        `,
        { transaction },
      );
      const [, movedChildren] = await sequelize.query(
        `
        UPDATE "drive" c
           SET "parent_id" = d.keeper_id
          FROM "drive_folder_dupes" d
         WHERE c."parent_id" = d."drive_id";
        `,
        { transaction },
      );

      // Shares follow their folder. `entity_id` carries no foreign key, so one
      // left pointing at a merged folder would simply stop resolving — but
      // `unique_share_per_user_entity` allows only one share per user per
      // entity, so the redundant ones have to go before the rest can move.
      // Nobody loses access: every dropped row duplicates a share of the keeper
      // that the same person already holds.
      if (sharesTable) {
        // Already covered by an identical share on the keeper.
        await sequelize.query(
          `
          DELETE FROM "drive_shares" s
           USING "drive_folder_dupes" d
           WHERE s."entity_type" = 'FOLDER'
             AND s."entity_id" = d."drive_id"
             AND EXISTS (
               SELECT 1 FROM "drive_shares" k
                WHERE k."entity_type" = 'FOLDER'
                  AND k."entity_id" = d.keeper_id
                  AND k."shared_with_user" = s."shared_with_user"
             );
          `,
          { transaction },
        );
        // Two duplicates shared with the same person: keep the oldest, since
        // both would land on the keeper and collide with each other.
        await sequelize.query(
          `
          DELETE FROM "drive_shares" s
           USING (
             SELECT sh."share_id",
                    row_number() OVER (
                      PARTITION BY d.keeper_id, sh."shared_with_user"
                      ORDER BY sh."created_at" ASC NULLS LAST, sh."share_id" ASC
                    ) AS rn
               FROM "drive_shares" sh
               JOIN "drive_folder_dupes" d ON d."drive_id" = sh."entity_id"
              WHERE sh."entity_type" = 'FOLDER'
           ) ranked
           WHERE s."share_id" = ranked."share_id" AND ranked.rn > 1;
          `,
          { transaction },
        );
        // What is left is one share per (keeper, user) and cannot collide.
        await sequelize.query(
          `
          UPDATE "drive_shares" s
             SET "entity_id" = d.keeper_id
            FROM "drive_folder_dupes" d
           WHERE s."entity_type" = 'FOLDER'
             AND s."entity_id" = d."drive_id";
          `,
          { transaction },
        );
      }
      const [, removed] = await sequelize.query(
        `
        DELETE FROM "drive" c
         USING "drive_folder_dupes" d
         WHERE c."drive_id" = d."drive_id";
        `,
        { transaction },
      );

      totals = {
        merged: totals.merged + (removed?.rowCount ?? 0),
        files: totals.files + (movedFiles?.rowCount ?? 0),
        children: totals.children + (movedChildren?.rowCount ?? 0),
      };
      console.log(
        `${TAG} Pass ${pass}: merged ${removed?.rowCount ?? 0} folder(s), ` +
        `moved ${movedFiles?.rowCount ?? 0} file(s) and ${movedChildren?.rowCount ?? 0} sub-folder(s).`,
      );
    }

    if (!settled) {
      // The index would fail on the leftovers anyway; say why rather than let
      // Postgres report a bare constraint violation.
      throw new Error(
        `${TAG} Still finding duplicate folders after ${MAX_PASSES} passes — stopping rather than looping.`,
      );
    }

    await sequelize.query("DROP TABLE IF EXISTS \"drive_folder_dupes\";", { transaction });

    if (totals.merged > 0) {
      console.log(
        `${TAG} Total: ${totals.merged} folder(s) merged, ` +
        `${totals.files} file(s) and ${totals.children} sub-folder(s) rehomed.`,
      );
    }

    // 3. The guarantee. Partial on deleted_at IS NULL so a paranoid soft-delete
    //    never collides with a folder created in its place afterwards.
    await sequelize.query(
      `
      CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME}
      ON "drive" (${KEY_COLUMNS})
      WHERE "deleted_at" IS NULL;
      `,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface) {
  // Only the index comes back off. The merged folders are gone and their
  // contents were rehomed, not copied — there is nothing left to split apart,
  // and re-creating empty duplicates would only recreate the bug.
  await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${INDEX_NAME};`);
}
