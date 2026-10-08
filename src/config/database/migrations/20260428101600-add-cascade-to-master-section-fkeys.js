const FK_DEFINITIONS = [
  {
    constraint: "master_section_company_id_fkey",
    column: "company_id",
    refTable: "company",
    refKey: "company_id",
  },
  {
    constraint: "master_section_builder_id_fkey",
    column: "builder_id",
    refTable: "builder",
    refKey: "builder_id",
  },
  {
    constraint: "master_section_created_by_fkey",
    column: "created_by",
    refTable: "users",
    refKey: "users_id",
  },
  {
    constraint: "master_section_updated_by_fkey",
    column: "updated_by",
    refTable: "users",
    refKey: "users_id",
  },
  {
    constraint: "master_section_quotation_format_id_fkey",
    column: "quotation_format_id",
    refTable: "quotation_format",
    refKey: "quotation_format_id",
  },
];

export async function up(queryInterface, Sequelize) {
  for (const fk of FK_DEFINITIONS) {
    try {
      // Drop the existing constraint
      await queryInterface.removeConstraint("master_section", fk.constraint);
    } catch (error) {
      console.warn(`Constraint ${fk.constraint} not found or could not be dropped:`, error.message);
    }

    // Re-add it with ON DELETE CASCADE using Sequelize queryInterface
    await queryInterface.addConstraint("master_section", {
      fields: [fk.column],
      type: "foreign key",
      name: fk.constraint,
      references: {
        table: fk.refTable,
        field: fk.refKey,
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  }
}

export async function down(queryInterface, Sequelize) {
  for (const fk of FK_DEFINITIONS) {
    try {
      // Drop the CASCADE constraint
      await queryInterface.removeConstraint("master_section", fk.constraint);
    } catch (error) {
       console.warn(`Constraint ${fk.constraint} not found or could not be dropped:`, error.message);
    }

    // Re-add it without ON DELETE CASCADE
    await queryInterface.addConstraint("master_section", {
      fields: [fk.column],
      type: "foreign key",
      name: fk.constraint,
      references: {
        table: fk.refTable,
        field: fk.refKey,
      },
      onDelete: "NO ACTION",
      onUpdate: "CASCADE",
    });
  }
}
