export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("master_section");
  if (!tableInfo.quotation_format_id) {
    await queryInterface.addColumn("master_section", "quotation_format_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "quotation_format", key: "quotation_format_id" },
      onDelete: "CASCADE",
    });
  }

  const indexes = await queryInterface.showIndex("master_section");
  if (!indexes.some((idx) => idx.name === "idx_master_section_quotation_format_id")) {
    await queryInterface.addIndex("master_section", ["quotation_format_id"], {
      name: "idx_master_section_quotation_format_id",
    });
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeIndex("master_section", "idx_master_section_quotation_format_id");
  await queryInterface.removeColumn("master_section", "quotation_format_id");
}