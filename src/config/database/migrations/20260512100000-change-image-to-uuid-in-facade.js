/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("facade");
    if (tableInfo.image_reference) {
      // Copy image_reference UUIDs to image column first
      await queryInterface.sequelize.query(`
        UPDATE "facade"
        SET "image" = "image_reference"
        WHERE "image_reference" IS NOT NULL;
      `);
    }

    // 1. Safely change 'image' column type to UUID, converting valid UUID strings
    // and setting non-valid UUID strings to NULL
    await queryInterface.sequelize.query(`
      ALTER TABLE "facade" 
      ALTER COLUMN "image" TYPE UUID 
      USING (CASE WHEN image::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN image::uuid ELSE NULL END);
    `);

    // 2. Add foreign key constraint to refer to drive_files
    await queryInterface.sequelize.query(`
      ALTER TABLE "facade" DROP CONSTRAINT IF EXISTS "facade_image_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "facade"
      ADD CONSTRAINT "facade_image_fkey" 
      FOREIGN KEY ("image") 
      REFERENCES "drive_files" ("file_id") 
      ON DELETE SET NULL;
    `);

    // 3. Remove 'image_reference' column if it exists
    if (tableInfo.image_reference) {
      await queryInterface.removeColumn("facade", "image_reference");
    }
  },

  async down(queryInterface, Sequelize) {
    // 1. Remove constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE "facade" DROP CONSTRAINT IF EXISTS "facade_image_fkey";
    `);

    // 2. Change 'image' column back to VARCHAR(500)
    await queryInterface.changeColumn("facade", "image", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });

    // 3. Re-add 'image_reference' column if it doesn't exist
    const tableInfo = await queryInterface.describeTable("facade");
    if (!tableInfo.image_reference) {
      await queryInterface.addColumn("facade", "image_reference", {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "drive_files",
          key: "file_id",
        },
        onDelete: "SET NULL",
      });
    }
  },
};
