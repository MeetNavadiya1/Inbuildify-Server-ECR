/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
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

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("facade");
    if (tableInfo.image_reference) {
      await queryInterface.removeColumn("facade", "image_reference");
    }
  },
};
