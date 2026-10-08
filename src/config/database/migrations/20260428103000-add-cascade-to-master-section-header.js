export async function up(queryInterface, Sequelize) {
  try {
    // Drop the existing constraint
    await queryInterface.removeConstraint("master_section_header", "master_section_header_master_section_id_fkey");
  } catch (error) {
    console.warn("Constraint master_section_header_master_section_id_fkey not found:", error.message);
  }

  // Re-add it with ON DELETE CASCADE
  await queryInterface.addConstraint("master_section_header", {
    fields: ["master_section_id"],
    type: "foreign key",
    name: "master_section_header_master_section_id_fkey",
    references: {
      table: "master_section",
      field: "master_section_id",
    },
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
}

export async function down(queryInterface, Sequelize) {
  try {
    await queryInterface.removeConstraint("master_section_header", "master_section_header_master_section_id_fkey");
  } catch (error) {
    console.warn("Constraint master_section_header_master_section_id_fkey not found:", error.message);
  }

  // Re-add it without ON DELETE CASCADE
  await queryInterface.addConstraint("master_section_header", {
    fields: ["master_section_id"],
    type: "foreign key",
    name: "master_section_header_master_section_id_fkey",
    references: {
      table: "master_section",
      field: "master_section_id",
    },
    onDelete: "NO ACTION",
    onUpdate: "CASCADE",
  });
}
