"use strict";

export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists("quotation_version_items");
    if (!tableExists) {
      return;
    }

    const table = await queryInterface.describeTable("quotation_version_items");

    if (!table.extra_type) {
      await queryInterface.addColumn("quotation_version_items", "extra_type", {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
    }

    if (!table.extra_item) {
      await queryInterface.addColumn("quotation_version_items", "extra_item", {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("quotation_version_items");

    if (table.extra_type) {
      await queryInterface.removeColumn("quotation_version_items", "extra_type");
    }

    if (table.extra_item) {
      await queryInterface.removeColumn("quotation_version_items", "extra_item");
    }
  },
};
