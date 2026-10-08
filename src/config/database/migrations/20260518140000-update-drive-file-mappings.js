/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Update Master Facade Files
      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "reference_id" = "sub_reference_id",
            "reference_id_name" = 'facade',
            "sub_reference_id" = NULL,
            "sub_reference" = 'facade_image'
        WHERE "sub_reference" = 'facade image' AND "reference_id" IS NULL;
      `, { transaction });

      // 2. Update Master Floor Plan Detailed Files
      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "reference_id" = "sub_reference_id",
            "reference_id_name" = 'floor_plan',
            "sub_reference_id" = NULL,
            "sub_reference" = 'floor_plan_detailed_image'
        WHERE "sub_reference" = 'floor plan detailed image' AND "reference_id" IS NULL;
      `, { transaction });

      // 3. Update Master Floor Plan Simple Files
      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "reference_id" = "sub_reference_id",
            "reference_id_name" = 'floor_plan',
            "sub_reference_id" = NULL,
            "sub_reference" = 'floor_plan_simple_image'
        WHERE "sub_reference" = 'floor plan simple image' AND "reference_id" IS NULL;
      `, { transaction });

      // 4. Update Cloned Facade Files (Quotation Version)
      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "reference_id_name" = 'quotation',
            "sub_reference" = 'facade_image'
        WHERE "sub_reference" = 'facade image' AND "reference_id" IS NOT NULL;
      `, { transaction });

      // 5. Update Cloned Floor Plan Detailed Files
      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "reference_id_name" = 'quotation',
            "sub_reference" = 'floor_plan_detailed_image'
        WHERE "sub_reference" = 'floor plan detailed image' AND "reference_id" IS NOT NULL;
      `, { transaction });

      // 6. Update Cloned Floor Plan Simple Files
      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "reference_id_name" = 'quotation',
            "sub_reference" = 'floor_plan_simple_image'
        WHERE "sub_reference" = 'floor plan simple image' AND "reference_id" IS NOT NULL;
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Revert Master Facade Files
      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "sub_reference_id" = "reference_id",
            "sub_reference" = 'facade image',
            "reference_id" = NULL,
            "reference_id_name" = NULL
        WHERE "sub_reference" = 'facade_image' AND "reference_id_name" = 'facade';
      `, { transaction });

      // Revert Master Floor Plan Detailed Files
      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "sub_reference_id" = "reference_id",
            "sub_reference" = 'floor plan detailed image',
            "reference_id" = NULL,
            "reference_id_name" = NULL
        WHERE "sub_reference" = 'floor_plan_detailed_image' AND "reference_id_name" = 'floor_plan';
      `, { transaction });

      // Revert Master Floor Plan Simple Files
      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "sub_reference_id" = "reference_id",
            "sub_reference" = 'floor plan simple image',
            "reference_id" = NULL,
            "reference_id_name" = NULL
        WHERE "sub_reference" = 'floor_plan_simple_image' AND "reference_id_name" = 'floor_plan';
      `, { transaction });

      // Revert Cloned Files
      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "reference_id_name" = 'facade image',
            "sub_reference" = 'facade image'
        WHERE "sub_reference" = 'facade_image' AND "reference_id_name" = 'quotation';
      `, { transaction });

      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "reference_id_name" = 'floor plan detailed image',
            "sub_reference" = 'floor plan detailed image'
        WHERE "sub_reference" = 'floor_plan_detailed_image' AND "reference_id_name" = 'quotation';
      `, { transaction });

      await queryInterface.sequelize.query(`
        UPDATE "drive_files"
        SET "reference_id_name" = 'floor plan simple image',
            "sub_reference" = 'floor plan simple image'
        WHERE "sub_reference" = 'floor_plan_simple_image' AND "reference_id_name" = 'quotation';
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
