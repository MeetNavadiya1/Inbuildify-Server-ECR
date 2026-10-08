"use strict";

export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists("maintenance_request");
    if (!tableExists) return;

    const tableInfo = await queryInterface.describeTable("maintenance_request");
    if (!tableInfo.attach_file) {
      await queryInterface.addColumn("maintenance_request", "attach_file", {
        type: Sequelize.STRING(500),
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists("maintenance_request");
    if (!tableExists) return;

    const tableInfo = await queryInterface.describeTable("maintenance_request");
    if (tableInfo.attach_file) {
      await queryInterface.removeColumn("maintenance_request", "attach_file");
    }
  },
};
