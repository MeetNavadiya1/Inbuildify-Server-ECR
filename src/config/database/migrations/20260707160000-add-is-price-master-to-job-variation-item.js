"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("job_variation_item");

    // Marks an item as a colour / price-master item (sourced from the price
    // master), as opposed to a manually-added extra. Controls whether the item
    // appears in the PDF when the variation's show_price_master_in_pdf is off.
    if (!tableInfo.is_price_master) {
      await queryInterface.addColumn("job_variation_item", "is_price_master", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("job_variation_item", "is_price_master");
  },
};
