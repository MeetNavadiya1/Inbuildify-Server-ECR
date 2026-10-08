'use strict';

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  // Idempotent: the columns may already exist (e.g. created by sequelize.sync()
  // from the Drive model before this migration is recorded as applied).
  const table = await queryInterface.describeTable('drive');
  if (!table.reference_id) {
    await queryInterface.addColumn('drive', 'reference_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
  }
  if (!table.reference_type) {
    await queryInterface.addColumn('drive', 'reference_type', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('drive', 'reference_id');
  await queryInterface.removeColumn('drive', 'reference_type');
}
