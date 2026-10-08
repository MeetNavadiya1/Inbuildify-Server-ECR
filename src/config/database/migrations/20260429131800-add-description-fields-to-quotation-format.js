"use strict";

export default {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("quotation_format");

    if (!tableInfo.description_2) {
      await queryInterface.addColumn("quotation_format", "description_2", {
        type: Sequelize.STRING(255),
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!tableInfo.description_3) {
      await queryInterface.addColumn("quotation_format", "description_3", {
        type: Sequelize.STRING(255),
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('quotation_format', 'description_2');
    await queryInterface.removeColumn('quotation_format', 'description_3');
  },
};