/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("drive_files");
    if (tableInfo.reference_id_name) {
      await queryInterface.removeColumn("drive_files", "reference_id_name");
    }
    if (tableInfo.sub_reference) {
      await queryInterface.removeColumn("drive_files", "sub_reference");
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("drive_files");
    if (!tableInfo.reference_id_name) {
      await queryInterface.addColumn("drive_files", "reference_id_name", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!tableInfo.sub_reference) {
      await queryInterface.addColumn("drive_files", "sub_reference", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },
};
