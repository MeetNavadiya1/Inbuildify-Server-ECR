export async function up(queryInterface) {
  await queryInterface.sequelize.query(
    `ALTER TYPE "enum_notification_template_template_type" ADD VALUE IF NOT EXISTS 'QUOTE_ACCEPTED';`
  );
}

export async function down() {
  console.warn("Down: cannot remove QUOTE_ACCEPTED enum value automatically");
}
