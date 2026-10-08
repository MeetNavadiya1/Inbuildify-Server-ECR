/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // 1. Convert detailed_image column type to UUID, converting valid UUID strings
    // and setting non-valid UUID strings to NULL
    await queryInterface.sequelize.query(`
      ALTER TABLE "floor_plan" 
      ALTER COLUMN "detailed_image" TYPE UUID 
      USING (CASE WHEN detailed_image::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN detailed_image::uuid ELSE NULL END);
    `);

    // 2. Convert simple_image column type to UUID, converting valid UUID strings
    // and setting non-valid UUID strings to NULL
    await queryInterface.sequelize.query(`
      ALTER TABLE "floor_plan" 
      ALTER COLUMN "simple_image" TYPE UUID 
      USING (CASE WHEN simple_image::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN simple_image::uuid ELSE NULL END);
    `);

    // 3. Add foreign key constraints to refer to drive_files
    await queryInterface.sequelize.query(`
      ALTER TABLE "floor_plan" DROP CONSTRAINT IF EXISTS "floor_plan_detailed_image_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "floor_plan"
      ADD CONSTRAINT "floor_plan_detailed_image_fkey" 
      FOREIGN KEY ("detailed_image") 
      REFERENCES "drive_files" ("file_id") 
      ON DELETE SET NULL;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "floor_plan" DROP CONSTRAINT IF EXISTS "floor_plan_simple_image_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "floor_plan"
      ADD CONSTRAINT "floor_plan_simple_image_fkey" 
      FOREIGN KEY ("simple_image") 
      REFERENCES "drive_files" ("file_id") 
      ON DELETE SET NULL;
    `);
  },

  async down(queryInterface, Sequelize) {
    // 1. Remove constraints
    await queryInterface.sequelize.query(`
      ALTER TABLE "floor_plan" DROP CONSTRAINT IF EXISTS "floor_plan_detailed_image_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "floor_plan" DROP CONSTRAINT IF EXISTS "floor_plan_simple_image_fkey";
    `);

    // 2. Change columns back to VARCHAR(500)
    await queryInterface.changeColumn("floor_plan", "detailed_image", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
    await queryInterface.changeColumn("floor_plan", "simple_image", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  },
};
