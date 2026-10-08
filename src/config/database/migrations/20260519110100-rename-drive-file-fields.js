/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("drive_files");
    if (tableInfo.reference_id_name && !tableInfo.reference_type) {
      await queryInterface.renameColumn("drive_files", "reference_id_name", "reference_type");
    }
    if (tableInfo.sub_reference && !tableInfo.sub_reference_type) {
      await queryInterface.renameColumn("drive_files", "sub_reference", "sub_reference_type");
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("drive_files");
    if (tableInfo.reference_type && !tableInfo.reference_id_name) {
      await queryInterface.renameColumn("drive_files", "reference_type", "reference_id_name");
    }
    if (tableInfo.sub_reference_type && !tableInfo.sub_reference) {
      await queryInterface.renameColumn("drive_files", "sub_reference_type", "sub_reference");
    }
  },
};
