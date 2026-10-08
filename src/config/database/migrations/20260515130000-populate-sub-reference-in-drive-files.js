export default {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // 1. Update facade images
      await queryInterface.sequelize.query(
        `UPDATE "drive_files" 
         SET "sub_reference_id" = "reference_id", 
             "sub_reference" = 'facade image',
             "reference_id" = NULL,
             "reference_id_name" = NULL
         WHERE "reference_id_name" ILIKE '%facade%image%';`,
        { transaction: t }
      );

      // 2. Update floor plan detailed images
      await queryInterface.sequelize.query(
        `UPDATE "drive_files" 
         SET "sub_reference_id" = "reference_id", 
             "sub_reference" = 'floor plan detailed image',
             "reference_id" = NULL,
             "reference_id_name" = NULL
         WHERE "reference_id_name" ILIKE '%detailed%image%';`,
        { transaction: t }
      );

      // 3. Update floor plan simple images
      await queryInterface.sequelize.query(
        `UPDATE "drive_files" 
         SET "sub_reference_id" = "reference_id", 
             "sub_reference" = 'floor plan simple image',
             "reference_id" = NULL,
             "reference_id_name" = NULL
         WHERE "reference_id_name" ILIKE '%simple%image%';`,
        { transaction: t }
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `UPDATE "drive_files" 
         SET "reference_id" = "sub_reference_id", 
             "reference_id_name" = "sub_reference",
             "sub_reference_id" = NULL, 
             "sub_reference" = NULL 
         WHERE "sub_reference" IN ('facade image', 'floor plan detailed image', 'floor plan simple image');`,
        { transaction: t }
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
};
