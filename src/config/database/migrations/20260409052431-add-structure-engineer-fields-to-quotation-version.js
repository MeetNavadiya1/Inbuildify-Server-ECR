"use strict";

export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists("quotation_version");
    if (!tableExists) {
      return;
    }

    const table = await queryInterface.describeTable("quotation_version");

    if (!table.structure_engineer_id) {
      await queryInterface.addColumn("quotation_version", "structure_engineer_id", {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    if (!table.structure_engineer_price) {
      await queryInterface.addColumn("quotation_version", "structure_engineer_price", {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("quotation_version");

    if (table.structure_engineer_id) {
      await queryInterface.removeColumn("quotation_version", "structure_engineer_id");
    }
    if (table.structure_engineer_price) {
      await queryInterface.removeColumn("quotation_version", "structure_engineer_price");
    }
  },
};
