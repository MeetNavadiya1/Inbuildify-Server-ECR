"use strict";

export default {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("quotation_format");
    if (!tableInfo.show_quotation_with_builder_detailed) {
      await queryInterface.addColumn("quotation_format", "show_quotation_with_builder_detailed", {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("quotation_format", "show_quotation_with_builder_detailed");
  },
};
