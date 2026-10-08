/**
 * Add color_id column to color_item table
 */
export default {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "color_item" 
      ADD COLUMN IF NOT EXISTS "color_id" UUID REFERENCES "color" ("color_id") ON DELETE SET NULL ON UPDATE CASCADE;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "color_item" DROP COLUMN IF EXISTS "color_id";
    `);
  },
};
