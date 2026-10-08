"use strict";

// Acknowledgment of the Commencement Letter by the customer (via the public
// /external page). Status drives the email's "Acknowledge Receipt" button.
export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("job");

  if (!tableInfo.commencement_ack_status) {
    await queryInterface.addColumn("job", "commencement_ack_status", {
      type: Sequelize.STRING(20),
      allowNull: true, // null = not yet sent; PENDING once sent; ACCEPTED/DECLINED on response
    });
  }
  if (!tableInfo.commencement_ack_comments) {
    await queryInterface.addColumn("job", "commencement_ack_comments", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  }
  if (!tableInfo.commencement_ack_at) {
    await queryInterface.addColumn("job", "commencement_ack_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job", "commencement_ack_status");
  await queryInterface.removeColumn("job", "commencement_ack_comments");
  await queryInterface.removeColumn("job", "commencement_ack_at");
}
