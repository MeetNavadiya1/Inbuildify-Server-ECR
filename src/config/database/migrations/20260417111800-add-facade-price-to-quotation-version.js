"use strict";

export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists("quotation_version");
    if (!tableExists) return;

    const table = await queryInterface.describeTable("quotation_version");

    if (!table.facade_price) {
      await queryInterface.addColumn("quotation_version", "facade_price", {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("quotation_version");

    if (table.facade_price) {
      await queryInterface.removeColumn("quotation_version", "facade_price");
    }
  },
};
