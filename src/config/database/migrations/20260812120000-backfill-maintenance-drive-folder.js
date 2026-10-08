"use strict";

/**
 * Put the maintenance files that already exist into a drive folder.
 *
 * Everything uploaded on Maintenance → Documents or Maintenance → Site Images
 * was written through `createImageDriveFile`, which never set `folder_id`. The
 * rows were correct in every other respect — they listed on their own tabs and
 * downloaded fine — but with no folder they belonged nowhere in the drive tree,
 * so S Drive had nothing to show. The service now files new uploads under
 * "Maintenance Documents"; this brings the existing ones in with them.
 *
 * One folder per company, at the drive root with `builder_id` NULL, matching how
 * `isSystemFolder` classifies the other generated buckets — a builder-stamped
 * copy would be invisible to colleagues and would duplicate per builder.
 *
 * Companies with no maintenance files are skipped rather than given an empty
 * folder: the drive root is a short list a builder reads at a glance, and a
 * bucket for something they have never uploaded is noise.
 *
 * Idempotent. It only claims files whose `folder_id` IS NULL, so a second run
 * moves nothing, and a file a user has since dragged elsewhere is left alone.
 */

const FOLDER_NAME = "Maintenance Documents";

/** The reference types a maintenance upload carries. */
const REFERENCE_TYPES = ["Maintenance", "MaintenanceSiteImage"];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const TAG = "[backfill-maintenance-drive-folder]";
  const { sequelize } = queryInterface;
  const transaction = await sequelize.transaction();

  try {
    // Companies that actually hold unfiled maintenance files.
    const [companies] = await sequelize.query(
      `
      SELECT DISTINCT "company_id"
        FROM "drive_files"
       WHERE "reference_type" IN (:referenceTypes)
         AND "folder_id" IS NULL
         AND "company_id" IS NOT NULL
      `,
      { replacements: { referenceTypes: REFERENCE_TYPES }, transaction },
    );

    if (!companies.length) {
      // eslint-disable-next-line no-console
      console.log(`${TAG} no unfiled maintenance files — nothing to do`);
      await transaction.commit();
      return;
    }

    let filed = 0;

    for (const { company_id: companyId } of companies) {
      // Reuse the company's folder if it already has one — the service may have
      // created it on an upload since this migration was written. Compared
      // case-insensitively on a trimmed name, the same identity the partial
      // unique index from 20260811120000 enforces.
      const [[existing]] = await sequelize.query(
        `
        SELECT "drive_id"
          FROM "drive"
         WHERE "company_id" = :companyId
           AND "builder_id" IS NULL
           AND "parent_id" IS NULL
           AND "reference_id" IS NULL
           AND lower(btrim("name")) = lower(:folderName)
           AND "deleted_at" IS NULL
         LIMIT 1
        `,
        { replacements: { companyId, folderName: FOLDER_NAME }, transaction },
      );

      let driveId = existing?.drive_id;

      if (!driveId) {
        const [[created]] = await sequelize.query(
          `
          INSERT INTO "drive" ("company_id", "name", "created_at", "updated_at")
          VALUES (:companyId, :folderName, NOW(), NOW())
          RETURNING "drive_id"
          `,
          { replacements: { companyId, folderName: FOLDER_NAME }, transaction },
        );
        driveId = created.drive_id;
      }

      const [, updated] = await sequelize.query(
        `
        UPDATE "drive_files"
           SET "folder_id" = :driveId,
               "updated_at" = NOW()
         WHERE "company_id" = :companyId
           AND "reference_type" IN (:referenceTypes)
           AND "folder_id" IS NULL
        `,
        {
          replacements: { driveId, companyId, referenceTypes: REFERENCE_TYPES },
          transaction,
        },
      );

      filed += updated?.rowCount ?? 0;
    }

    // eslint-disable-next-line no-console
    console.log(`${TAG} filed ${filed} file(s) across ${companies.length} company(ies)`);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface) {
  // Unfile the maintenance files again and drop the folders that leaves empty.
  // Deliberately narrow: only files still pointing at a folder of this name are
  // released, so anything a user has moved since keeps its place.
  const { sequelize } = queryInterface;
  const transaction = await sequelize.transaction();

  try {
    await sequelize.query(
      `
      UPDATE "drive_files" f
         SET "folder_id" = NULL,
             "updated_at" = NOW()
        FROM "drive" d
       WHERE f."folder_id" = d."drive_id"
         AND f."reference_type" IN (:referenceTypes)
         AND lower(btrim(d."name")) = lower(:folderName)
      `,
      { replacements: { referenceTypes: REFERENCE_TYPES, folderName: FOLDER_NAME }, transaction },
    );

    await sequelize.query(
      `
      DELETE FROM "drive" d
       WHERE lower(btrim(d."name")) = lower(:folderName)
         AND d."parent_id" IS NULL
         AND d."reference_id" IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM "drive_files" f WHERE f."folder_id" = d."drive_id"
         )
         AND NOT EXISTS (
           SELECT 1 FROM "drive" c WHERE c."parent_id" = d."drive_id"
         )
      `,
      { replacements: { folderName: FOLDER_NAME }, transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
