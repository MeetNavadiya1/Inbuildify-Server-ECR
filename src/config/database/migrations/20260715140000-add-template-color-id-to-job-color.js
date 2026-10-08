"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("job_color", "template_color_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("job_color", "template_color_id");
  },
};
