import { DRIVE_FILE_MAPPING } from "../../../constants/driveFile.js";

/**
 * Convert property_detail.compaction_report_url from a raw S3 URL string into a
 * UUID foreign key pointing at drive_files.file_id. The file's s3_key/URL then
 * lives ONLY in drive_files (sub_reference_type = CompactionReport).
 *
 * For every row, in order:
 *   1. If an active drive_files row already exists for this property_detail
 *      (the upload path already writes one), point the column at it.
 *   2. Otherwise, if the column still holds a legacy URL, create a drive_files
 *      row from that URL and point the column at the new PK.
 *   3. Convert the column type VARCHAR -> UUID and add an FK (ON DELETE SET NULL).
 *
 * Mirrors the QuotationVersion report-column migration (20260523140000) and the
 * facade / floor_plan legacy-URL migration (20260512120000). Runs after the
 * polymorphic partial unique index (20260523120000), so step 1 can only ever
 * match a single active row.
 *
 * @type {import('sequelize-cli').Migration}
 */
const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
const REFERENCE_TYPE = DRIVE_FILE_MAPPING.REFERENCE_NAMES.PROPERTY_DETAIL;
const SUB_TYPE = DRIVE_FILE_MAPPING.SUB_REFERENCES.COMPACTION_REPORT;
const COLUMN = "compaction_report_url";

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
      // Detect if the column is already UUID so the assignment uses the right cast.
      const [[columnInfo]] = await sequelize.query(
        `
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'property_detail'
          AND column_name = :column
        `,
        { replacements: { column: COLUMN }, transaction },
      );
      const isUuid = columnInfo && columnInfo.data_type === "uuid";
      const castExpr = isUuid ? "" : "::text";

      // 1. Link rows to an already-existing active drive_files row.
      await sequelize.query(
        `
        UPDATE "property_detail" pd
        SET "${COLUMN}" = df.file_id${castExpr}
        FROM "drive_files" df
        WHERE df.reference_id = pd.property_detail_id
          AND df.reference_type = :referenceType
          AND df.sub_reference_type = :subType
          AND df.deleted_at IS NULL
          AND (pd."${COLUMN}" IS NULL OR pd."${COLUMN}"::text !~* :uuidPattern)
        `,
        { replacements: { referenceType: REFERENCE_TYPE, subType: SUB_TYPE, uuidPattern: UUID_PATTERN }, transaction },
      );

      // 2. Remaining URL rows have no drive_files row yet — create one.
      //    DISTINCT ON guards against a property linked to more than one lead
      //    (would otherwise try to insert duplicate active rows).
      const [urlRows] = await sequelize.query(
        `
        SELECT DISTINCT ON (pd.property_detail_id)
               pd.property_detail_id, pd."${COLUMN}" AS url,
               l.leads_id, l.company_id, l.builder_id
        FROM "property_detail" pd
        LEFT JOIN "leads" l ON l.property_detail_id = pd.property_detail_id
        WHERE pd."${COLUMN}" IS NOT NULL
          AND pd."${COLUMN}"::text !~* :uuidPattern
        ORDER BY pd.property_detail_id, l.created_at ASC NULLS LAST
        `,
        { replacements: { uuidPattern: UUID_PATTERN }, transaction },
      );

      let counter = 0;
      for (const row of urlRows) {
        const s3Key = extractS3Key(row.url);
        const originalName = s3Key.split("/").pop() || `${SUB_TYPE}.pdf`;
        const ext = extractExtension(originalName);
        const fileName = `pd_${row.property_detail_id}_${SUB_TYPE}_${Date.now()}_${counter++}_${originalName}`;

        const [[inserted]] = await sequelize.query(
          `
          INSERT INTO "drive_files"
            (file_id, company_id, builder_id, lead_id, original_name, file_name,
             s3_key, file_extension, mime_type, reference_id, reference_type, sub_reference_type,
             created_at, updated_at)
          VALUES
            (gen_random_uuid(), :company_id, :builder_id, :lead_id, :original_name, :file_name,
             :s3_key, :file_extension, :mime_type, :reference_id, :reference_type, :sub_reference_type,
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
              mime_type: "application/pdf",
              reference_id: row.property_detail_id,
              reference_type: REFERENCE_TYPE,
              sub_reference_type: SUB_TYPE,
            },
            transaction,
          },
        );

        await sequelize.query(
          `UPDATE "property_detail" SET "${COLUMN}" = :file_id WHERE property_detail_id = :property_detail_id`,
          { replacements: { file_id: inserted.file_id, property_detail_id: row.property_detail_id }, transaction },
        );
      }

      // 3. Convert column type to UUID (any stray non-UUID value -> NULL) + FK.
      await sequelize.query(
        `
        ALTER TABLE "property_detail"
        ALTER COLUMN "${COLUMN}" TYPE UUID
        USING (CASE WHEN "${COLUMN}"::text ~* '${UUID_PATTERN}' THEN "${COLUMN}"::uuid ELSE NULL END)
        `,
        { transaction },
      );
      await sequelize.query(
        `ALTER TABLE "property_detail" DROP CONSTRAINT IF EXISTS "property_detail_${COLUMN}_fkey"`,
        { transaction },
      );
      await sequelize.query(
        `
        ALTER TABLE "property_detail"
        ADD CONSTRAINT "property_detail_${COLUMN}_fkey"
        FOREIGN KEY ("${COLUMN}") REFERENCES "drive_files" ("file_id") ON DELETE SET NULL
        `,
        { transaction },
      );

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
      // Drop FK and revert to VARCHAR(500).
      await sequelize.query(
        `ALTER TABLE "property_detail" DROP CONSTRAINT IF EXISTS "property_detail_${COLUMN}_fkey"`,
        { transaction },
      );
      await queryInterface.changeColumn(
        "property_detail",
        COLUMN,
        { type: Sequelize.STRING(500), allowNull: true },
        { transaction },
      );
      // Best-effort restore: put the s3_key path back into the column.
      // (The full original URL cannot be reconstructed here, matching the
      // facade/floor_plan rollback. drive_files rows are intentionally kept.)
      await sequelize.query(
        `
        UPDATE "property_detail" pd
        SET "${COLUMN}" = df.s3_key
        FROM "drive_files" df
        WHERE pd."${COLUMN}" = df.file_id::text
        `,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
