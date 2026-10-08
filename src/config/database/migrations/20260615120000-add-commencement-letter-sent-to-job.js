"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("job");
  if (!tableInfo.commencement_letter_sent) {
    await queryInterface.addColumn("job", "commencement_letter_sent", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn("job", "commencement_letter_sent");
}
