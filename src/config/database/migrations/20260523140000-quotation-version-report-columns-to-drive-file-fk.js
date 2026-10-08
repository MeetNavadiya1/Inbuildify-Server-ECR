import { DRIVE_FILE_MAPPING } from "../../../constants/driveFile.js";

/**
 * Convert the QuotationVersion report columns from raw S3 URL strings into
 * UUID foreign keys pointing at drive_files.file_id. The file's s3_key/URL
 * then lives ONLY in drive_files.
 *
 *   structure_engineer_report  -> sub_reference_type = StructureEngineerReport
 *   quotation_version_detail   -> sub_reference_type = EngineeringRequirement
 *
 * For every row, in order:
 *   1. If an active drive_files row already exists for this version + sub_type
 *      (the upload path already writes one), point the column at it.
 *   2. Otherwise, if the column still holds a legacy URL, create a drive_files
 *      row from that URL and point the column at the new PK.
 *   3. Convert the column type TEXT -> UUID and add an FK (ON DELETE SET NULL).
 *
 * Mirrors the facade / floor_plan legacy-URL migration (20260512120000 /
 * 20260512100000). Runs after the polymorphic partial unique index
 * (20260523120000), so step 1 can only ever match a single active row.
 *
 * @type {import('sequelize-cli').Migration}
 */
const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
const VERSION_REFERENCE = DRIVE_FILE_MAPPING.REFERENCE_NAMES.QUOTATION_VERSION;

const COLUMNS = [
  { column: "structure_engineer_report", subType: DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_REPORT },
  { column: "quotation_version_detail", subType: DRIVE_FILE_MAPPING.SUB_REFERENCES.ENGINEERING_REQUIREMENT },
];

const extractS3Key = (url) => {
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith("/") ? pathname.slice(1) : pathname;
  } catch {
    return url; // already a bare key
  }
};
const extractExtension = (name) => {
  const parts = String(name).split(".");
  return parts.length > 1 ? parts.pop() : null;
};

export default {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();
    try {
      for (const { column, subType } of COLUMNS) {
        // Detect if the column is already UUID in the database to apply the correct cast in assignment
        const [[columnInfo]] = await sequelize.query(
          `
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_name = 'quotation_version' 
            AND column_name = :column
          `,
          { replacements: { column }, transaction }
        );
        const isUuid = columnInfo && columnInfo.data_type === "uuid";
        const castExpr = isUuid ? "" : "::text";

        // 1. Link rows to an already-existing active drive_files row.
        await sequelize.query(
          `
          UPDATE "quotation_version" qv
          SET "${column}" = df.file_id${castExpr}
          FROM "drive_files" df
          WHERE df.reference_id = qv.quotation_version_id
            AND df.reference_type = :referenceType
            AND df.sub_reference_type = :subType
            AND df.deleted_at IS NULL
            AND (qv."${column}" IS NULL OR qv."${column}"::text !~* :uuidPattern)
          `,
          { replacements: { referenceType: VERSION_REFERENCE, subType, uuidPattern: UUID_PATTERN }, transaction },
        );

        // 2. Remaining URL rows have no drive_files row yet — create one.
        const [urlRows] = await sequelize.query(
          `
          SELECT qv.quotation_version_id, qv."${column}" AS url,
                 l.leads_id, l.company_id, l.builder_id
          FROM "quotation_version" qv
          LEFT JOIN "quotation" q ON q.quotation_id = qv.quotation_id
          LEFT JOIN "leads" l ON l.leads_id = q.leads_id
          WHERE qv."${column}" IS NOT NULL
            AND qv."${column}"::text !~* :uuidPattern
          `,
          { replacements: { uuidPattern: UUID_PATTERN }, transaction },
        );

        let counter = 0;
        for (const row of urlRows) {
          const s3Key = extractS3Key(row.url);
          const originalName = s3Key.split("/").pop() || `${subType}.pdf`;
          const ext = extractExtension(originalName);
          const fileName = `qv_${row.quotation_version_id}_${subType}_${Date.now()}_${counter++}_${originalName}`;

          const [[inserted]] = await sequelize.query(
            `
            INSERT INTO "drive_files"
              (file_id, company_id, builder_id, lead_id, original_name, file_name,
               s3_key, file_extension, reference_id, reference_type, sub_reference_type,
               created_at, updated_at)
            VALUES
              (gen_random_uuid(), :company_id, :builder_id, :lead_id, :original_name, :file_name,
               :s3_key, :file_extension, :reference_id, :reference_type, :sub_reference_type,
               NOW(), NOW())
            RETURNING file_id
            `,
            {
              replacements: {
                company_id: row.company_id || null,
                builder_id: row.builder_id || null,
                lead_id: row.leads_id || null,
                original_name: originalName,
                file_name: fileName,
                s3_key: s3Key,
                file_extension: ext || null,
                reference_id: row.quotation_version_id,
                reference_type: VERSION_REFERENCE,
                sub_reference_type: subType,
              },
              transaction,
            },
          );

          await sequelize.query(
            `UPDATE "quotation_version" SET "${column}" = :file_id WHERE quotation_version_id = :version_id`,
            { replacements: { file_id: inserted.file_id, version_id: row.quotation_version_id }, transaction },
          );
        }

        // 3. Convert column type to UUID (any stray non-UUID value -> NULL) + FK.
        await sequelize.query(
          `
          ALTER TABLE "quotation_version"
          ALTER COLUMN "${column}" TYPE UUID
          USING (CASE WHEN "${column}"::text ~* '${UUID_PATTERN}' THEN "${column}"::uuid ELSE NULL END)
          `,
          { transaction },
        );
        await sequelize.query(
          `ALTER TABLE "quotation_version" DROP CONSTRAINT IF EXISTS "quotation_version_${column}_fkey"`,
          { transaction },
        );
        await sequelize.query(
          `
          ALTER TABLE "quotation_version"
          ADD CONSTRAINT "quotation_version_${column}_fkey"
          FOREIGN KEY ("${column}") REFERENCES "drive_files" ("file_id") ON DELETE SET NULL
          `,
          { transaction },
        );
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();
    try {
      for (const { column } of COLUMNS) {
        // Drop FK and revert to TEXT.
        await sequelize.query(
          `ALTER TABLE "quotation_version" DROP CONSTRAINT IF EXISTS "quotation_version_${column}_fkey"`,
          { transaction },
        );
        await queryInterface.changeColumn(
          "quotation_version",
          column,
          { type: Sequelize.TEXT, allowNull: true },
          { transaction },
        );
        // Best-effort restore: put the s3_key path back into the column.
        // (The full original URL cannot be reconstructed here, matching the
        // facade/floor_plan rollback. drive_files rows are intentionally kept.)
        await sequelize.query(
          `
          UPDATE "quotation_version" qv
          SET "${column}" = df.s3_key
          FROM "drive_files" df
          WHERE qv."${column}" = df.file_id::text
          `,
          { transaction },
        );
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
