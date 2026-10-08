/**
 * Migration: Migrate legacy S3 URL strings stored in facade.image,
 * floor_plan.detailed_image, and floor_plan.simple_image into the
 * drive_files table. After migration, those columns will hold the
 * drive_files.file_id (UUID) instead of a raw URL.
 *
 * The afterFind hooks on Facade and FloorPlan models resolve the
 * UUID back to a full S3 URL on-the-fly, so API responses are unchanged.
 */
export default {
  async up(queryInterface) {
    const uuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

    // --------------------------------------------------------------------------
    // HELPER: extract the S3 key from a full URL
    //   "https://bucket.s3.amazonaws.com/facades/abc.jpg" → "facades/abc.jpg"
    // --------------------------------------------------------------------------
    const extractS3Key = (url) => {
      try {
        const { pathname } = new URL(url);
        return pathname.startsWith("/") ? pathname.slice(1) : pathname;
      } catch {
        return url; // fallback: store value as-is
      }
    };

    const extractOriginalName = (s3Key) => s3Key.split("/").pop();
    const extractExtension = (name) => {
      const parts = name.split(".");
      return parts.length > 1 ? parts.pop() : null;
    };

    const timestamp = () => new Date().toISOString();

    // --------------------------------------------------------------------------
    // FACADE: migrate rows where image holds a legacy S3 URL (not a UUID)
    // --------------------------------------------------------------------------
    const [facadeRows] = await queryInterface.sequelize.query(
      `SELECT facade_id, company_id, builder_id, image
       FROM "facade"
       WHERE "image" IS NOT NULL
         AND "image"::text !~* :pattern`,
      { replacements: { pattern: uuidPattern } },
    );

    for (const row of facadeRows) {
      const s3Key = extractS3Key(row.image);
      const originalName = extractOriginalName(s3Key);
      const ext = extractExtension(originalName);
      const fileName = `facade_${row.facade_id}_${Date.now()}_${originalName}`;

      const [[insertedFile]] = await queryInterface.sequelize.query(
        `INSERT INTO "drive_files"
           (file_id, company_id, builder_id, original_name, file_name,
            s3_key, file_extension, reference_id, reference_id_name,
            created_at, updated_at)
         VALUES
           (gen_random_uuid(), :company_id, :builder_id, :original_name, :file_name,
            :s3_key, :file_extension, :reference_id, :reference_id_name,
            :now, :now)
         RETURNING file_id`,
        {
          replacements: {
            company_id: row.company_id || null,
            builder_id: row.builder_id || null,
            original_name: originalName,
            file_name: fileName,
            s3_key: s3Key,
            file_extension: ext || null,
            reference_id: row.facade_id,
            reference_id_name: "facade image",
            now: timestamp(),
          },
        },
      );

      await queryInterface.sequelize.query(
        `UPDATE "facade" SET "image" = :file_id WHERE "facade_id" = :facade_id`,
        { replacements: { file_id: insertedFile.file_id, facade_id: row.facade_id } },
      );
    }

    // --------------------------------------------------------------------------
    // FLOOR PLAN: migrate rows where detailed_image holds a legacy S3 URL
    // --------------------------------------------------------------------------
    const [detailedRows] = await queryInterface.sequelize.query(
      `SELECT floor_plan_id, company_id, builder_id, detailed_image
       FROM "floor_plan"
       WHERE "detailed_image" IS NOT NULL
         AND "detailed_image"::text !~* :pattern`,
      { replacements: { pattern: uuidPattern } },
    );

    for (const row of detailedRows) {
      const s3Key = extractS3Key(row.detailed_image);
      const originalName = extractOriginalName(s3Key);
      const ext = extractExtension(originalName);
      const fileName = `floor_plan_detailed_${row.floor_plan_id}_${Date.now()}_${originalName}`;

      const [[insertedFile]] = await queryInterface.sequelize.query(
        `INSERT INTO "drive_files"
           (file_id, company_id, builder_id, original_name, file_name,
            s3_key, file_extension, reference_id, reference_id_name,
            created_at, updated_at)
         VALUES
           (gen_random_uuid(), :company_id, :builder_id, :original_name, :file_name,
            :s3_key, :file_extension, :reference_id, :reference_id_name,
            :now, :now)
         RETURNING file_id`,
        {
          replacements: {
            company_id: row.company_id || null,
            builder_id: row.builder_id || null,
            original_name: originalName,
            file_name: fileName,
            s3_key: s3Key,
            file_extension: ext || null,
            reference_id: row.floor_plan_id,
            reference_id_name: "floor plan detailed_image",
            now: timestamp(),
          },
        },
      );

      await queryInterface.sequelize.query(
        `UPDATE "floor_plan" SET "detailed_image" = :file_id WHERE "floor_plan_id" = :floor_plan_id`,
        { replacements: { file_id: insertedFile.file_id, floor_plan_id: row.floor_plan_id } },
      );
    }

    // --------------------------------------------------------------------------
    // FLOOR PLAN: migrate rows where simple_image holds a legacy S3 URL
    // --------------------------------------------------------------------------
    const [simpleRows] = await queryInterface.sequelize.query(
      `SELECT floor_plan_id, company_id, builder_id, simple_image
       FROM "floor_plan"
       WHERE "simple_image" IS NOT NULL
         AND "simple_image"::text !~* :pattern`,
      { replacements: { pattern: uuidPattern } },
    );

    for (const row of simpleRows) {
      const s3Key = extractS3Key(row.simple_image);
      const originalName = extractOriginalName(s3Key);
      const ext = extractExtension(originalName);
      const fileName = `floor_plan_simple_${row.floor_plan_id}_${Date.now()}_${originalName}`;

      const [[insertedFile]] = await queryInterface.sequelize.query(
        `INSERT INTO "drive_files"
           (file_id, company_id, builder_id, original_name, file_name,
            s3_key, file_extension, reference_id, reference_id_name,
            created_at, updated_at)
         VALUES
           (gen_random_uuid(), :company_id, :builder_id, :original_name, :file_name,
            :s3_key, :file_extension, :reference_id, :reference_id_name,
            :now, :now)
         RETURNING file_id`,
        {
          replacements: {
            company_id: row.company_id || null,
            builder_id: row.builder_id || null,
            original_name: originalName,
            file_name: fileName,
            s3_key: s3Key,
            file_extension: ext || null,
            reference_id: row.floor_plan_id,
            reference_id_name: "floor plan simple_image",
            now: timestamp(),
          },
        },
      );

      await queryInterface.sequelize.query(
        `UPDATE "floor_plan" SET "simple_image" = :file_id WHERE "floor_plan_id" = :floor_plan_id`,
        { replacements: { file_id: insertedFile.file_id, floor_plan_id: row.floor_plan_id } },
      );
    }
  },

  async down(queryInterface) {
    // Restore facade: replace UUID with s3_key from drive_files (partial URL path)
    // Note: full URL cannot be reconstructed without the bucket name at rollback time,
    // so we restore the s3_key value which is the path portion of the original URL.
    await queryInterface.sequelize.query(`
      UPDATE "facade" f
      SET "image" = df.s3_key
      FROM "drive_files" df
      WHERE f."image"::text = df.file_id::text
        AND df.reference_id_name = 'facade image'
    `);

    // Restore floor_plan detailed_image
    await queryInterface.sequelize.query(`
      UPDATE "floor_plan" fp
      SET "detailed_image" = df.s3_key::uuid
      FROM "drive_files" df
      WHERE fp."detailed_image"::text = df.file_id::text
        AND df.reference_id_name = 'floor plan detailed_image'
    `);

    // Restore floor_plan simple_image
    await queryInterface.sequelize.query(`
      UPDATE "floor_plan" fp
      SET "simple_image" = df.s3_key::uuid
      FROM "drive_files" df
      WHERE fp."simple_image"::text = df.file_id::text
        AND df.reference_id_name = 'floor plan simple_image'
    `);

    // Delete the drive_files records created by this migration
    await queryInterface.sequelize.query(`
      DELETE FROM "drive_files"
      WHERE reference_id_name IN ('facade image', 'floor plan detailed_image', 'floor plan simple_image')
    `)
  },
};
