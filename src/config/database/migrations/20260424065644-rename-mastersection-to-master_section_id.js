export default {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("master_section_header");

    if (tableInfo.master_section && tableInfo.master_section_id) {
      // Both columns exist — drop the old one
      await queryInterface.removeColumn("master_section_header", "master_section");
    } else if (tableInfo.master_section && !tableInfo.master_section_id) {
      // Only old column exists — rename it
      await queryInterface.renameColumn(
        "master_section_header",
        "master_section",
        "master_section_id"
      );
    }
    // If only master_section_id exists, nothing to do
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("master_section_header");

    if (tableInfo.master_section_id && !tableInfo.master_section) {
      await queryInterface.renameColumn(
        "master_section_header",
        "master_section_id",
        "master_section"
      );
    }
  },
};