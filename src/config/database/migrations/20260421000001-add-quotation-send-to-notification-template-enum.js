export async function up(queryInterface) {
  await queryInterface.sequelize.query(
    `ALTER TYPE "enum_notification_template_template_type" ADD VALUE IF NOT EXISTS 'QUOTATION_SEND';`
  );
}

export async function down() {
  // PostgreSQL does not support removing individual enum values without table/type recreation
  console.warn("Down: cannot remove QUOTATION_SEND enum value automatically");
}
