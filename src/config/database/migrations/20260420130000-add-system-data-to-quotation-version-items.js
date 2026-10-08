"use strict";

export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists("quotation_version_items");
    if (!tableExists) return;

    const table = await queryInterface.describeTable("quotation_version_items");

    if (!table.price_list_item_is_system_data) {
      await queryInterface.addColumn("quotation_version_items", "price_list_item_is_system_data", {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    const tableExists = await queryInterface.tableExists("quotation_version_items");
    if (!tableExists) return;

    const table = await queryInterface.describeTable("quotation_version_items");

    if (table.price_list_item_is_system_data) {
      await queryInterface.removeColumn("quotation_version_items", "price_list_item_is_system_data");
    }
  },
};
