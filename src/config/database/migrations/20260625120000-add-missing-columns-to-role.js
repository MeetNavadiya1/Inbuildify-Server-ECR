export async function up(queryInterface, Sequelize) {
  const tableExists = await queryInterface.tableExists("role");
  if (!tableExists) return;

  const tableInfo = await queryInterface.describeTable("role");

  if (!tableInfo.company_id) {
    await queryInterface.addColumn("role", "company_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  }

  if (!tableInfo.builder_id) {
    await queryInterface.addColumn("role", "builder_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  }

  if (!tableInfo.is_system) {
    await queryInterface.addColumn("role", "is_system", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
  }

  if (!tableInfo.is_active) {
    await queryInterface.addColumn("role", "is_active", {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  const tableExists = await queryInterface.tableExists("role");
  if (!tableExists) return;

  const tableInfo = await queryInterface.describeTable("role");

  if (tableInfo.company_id) {
    await queryInterface.removeColumn("role", "company_id");
  }

  if (tableInfo.builder_id) {
    await queryInterface.removeColumn("role", "builder_id");
  }

  if (tableInfo.is_system) {
    await queryInterface.removeColumn("role", "is_system");
  }

  if (tableInfo.is_active) {
    await queryInterface.removeColumn("role", "is_active");
  }
}
