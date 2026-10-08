"use strict";

const FOLDER_BY_SUB_REFERENCE = {
  QuotationReport: "Quotation Reports",
  SignedQuotationReport: "Quotation Reports",
  StructureEngineerReport: "Structure Engineer Reports",
  StructureEngineerUpload: "Structure Engineer Reports",
  EngineeringRequirement: "Engineering Requirements",
  CompactionReport: "Compaction Reports",
  ColorSelectionReport: "Colour Selection Reports",
  ColorScheduleDocument: "Colour Schedule Documents",
  BuildingContractPdf: "Building Contracts",
};

/** Bucket name → the sub-references that belong in it. */
const SUB_REFERENCES_BY_FOLDER = Object.entries(FOLDER_BY_SUB_REFERENCE).reduce(
  (acc, [subReference, folderName]) => {
    (acc[folderName] ||= []).push(subReference);
    return acc;
  },
  {},
);

/**
 * The company's bucket of this name, created if it does not exist.
 *
 * A bucket is company infrastructure rather than seeded content — the report
 * helpers file real quotation and colour PDFs into the same one — so it is
 * created unflagged and at the root with `builder_id` NULL, the identity
 * `isSystemFolder` gives it and the partial unique index from 20260811120000
 * enforces. A pre-existing builder-stamped row of the same name is reused
 * rather than twinned: adding a company-level copy beside it would put the same
 * bucket in the list twice.
 */
async function resolveFolderId(sequelize, companyId, folderName, transaction) {
  const [[systemLevel]] = await sequelize.query(
    `
    SELECT "drive_id"
      FROM "drive"
     WHERE "company_id" = :companyId
       AND "builder_id" IS NULL
       AND "parent_id" IS NULL
       AND "reference_id" IS NULL
       AND "deleted_at" IS NULL
       AND lower(btrim("name")) = lower(:folderName)
     LIMIT 1
    `,
    { replacements: { companyId, folderName }, transaction },
  );
  if (systemLevel) return systemLevel.drive_id;

  const [[builderLevel]] = await sequelize.query(
    `
    SELECT "drive_id"
      FROM "drive"
     WHERE "company_id" = :companyId
       AND "parent_id" IS NULL
       AND "reference_id" IS NULL
       AND "deleted_at" IS NULL
       AND lower(btrim("name")) = lower(:folderName)
     ORDER BY "created_at" ASC NULLS LAST, "drive_id" ASC
     LIMIT 1
    `,
    { replacements: { companyId, folderName }, transaction },
  );
  if (builderLevel) return builderLevel.drive_id;

  const [[created]] = await sequelize.query(
    `
    INSERT INTO "drive" ("company_id", "name", "created_at", "updated_at")
    VALUES (:companyId, :folderName, NOW(), NOW())
    RETURNING "drive_id"
    `,
    { replacements: { companyId, folderName }, transaction },
  );
  return created.drive_id;
}

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const TAG = "[file-orphaned-sample-drive-documents]";
  const { sequelize } = queryInterface;

  const existing = new Set(await queryInterface.showAllTables());
  if (!existing.has("drive_files") || !existing.has("drive")) return;

  const transaction = await sequelize.transaction();

  try {
    let filed = 0;
    const companiesTouched = new Set();

    for (const [folderName, subReferences] of Object.entries(SUB_REFERENCES_BY_FOLDER)) {
      // Only the companies that actually hold stranded documents of this kind —
      // an empty bucket for something a company has never generated is noise in
      // a list its users read at a glance.
      const [companies] = await sequelize.query(
        `
        SELECT DISTINCT "company_id"
          FROM "drive_files"
         WHERE "is_sample_data" = true
           AND "folder_id" IS NULL
           AND "company_id" IS NOT NULL
           AND "sub_reference_type" IN (:subReferences)
        `,
        { replacements: { subReferences }, transaction },
      );

      for (const { company_id: companyId } of companies) {
        const folderId = await resolveFolderId(sequelize, companyId, folderName, transaction);

        const [, updated] = await sequelize.query(
          `
          UPDATE "drive_files"
             SET "folder_id" = :folderId,
                 "updated_at" = NOW()
           WHERE "is_sample_data" = true
             AND "folder_id" IS NULL
             AND "company_id" = :companyId
             AND "sub_reference_type" IN (:subReferences)
          `,
          { replacements: { folderId, companyId, subReferences }, transaction },
        );

        filed += updated?.rowCount ?? 0;
        companiesTouched.add(companyId);
      }
    }

    if (filed === 0) {
      console.log(`${TAG} no unfiled sample documents — nothing to do`);
    } else {
      console.log(
        `${TAG} filed ${filed} sample document(s) into their My Drive bucket ` +
          `across ${companiesTouched.size} company(ies)`,
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Nothing to undo. Every row this touched had no folder at all, and which of
 * them was unfiled by the import rather than by a person is not recorded —
 * clearing `folder_id` again would take out documents that were filed correctly
 * to begin with.
 */
export async function down() {
  // Intentionally empty.
}

export default { up, down };
