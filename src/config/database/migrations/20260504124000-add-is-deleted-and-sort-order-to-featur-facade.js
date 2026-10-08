'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  up: async (queryInterface, Sequelize) => {
    // This migration is intentionally left empty to resolve a crash caused by an empty file.
    // The fields 'is_delete' and 'sort_order' are handled in other migrations.
  },

  down: async (queryInterface, Sequelize) => {
    // No action needed for rollback.
  }
};
