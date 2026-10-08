const FK_DEFINITIONS = [
  {
    constraint: "quotation_format_custom_section_company_id_fkey",
    column: "company_id",
    refTable: "company",
    refKey: "company_id",
  },
  {
    constraint: "quotation_format_custom_section_builder_id_fkey",
    column: "builder_id",
    refTable: "builder",
    refKey: "builder_id",
  },
  {
    constraint: "quotation_format_custom_section_created_by_fkey",
    column: "created_by",
    refTable: "users",
    refKey: "users_id",
  },
  {
    constraint: "quotation_format_custom_section_updated_by_fkey",
    column: "updated_by",
    refTable: "users",
    refKey: "users_id",
  },
  {
    constraint: "quotation_format_custom_section_quotation_format_id_fkey",
    column: "quotation_format_id",
    refTable: "quotation_format",
    refKey: "quotation_format_id",
  },
];

export async function up(queryInterface, Sequelize) {
  for (const fk of FK_DEFINITIONS) {
    try {
      await queryInterface.removeConstraint("quotation_format_custom_section", fk.constraint);
    } catch (error) {
      console.warn(`Constraint ${fk.constraint} not found:`, error.message);
    }

    await queryInterface.addConstraint("quotation_format_custom_section", {
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
      await queryInterface.removeConstraint("quotation_format_custom_section", fk.constraint);
    } catch (error) {
      console.warn(`Constraint ${fk.constraint} not found:`, error.message);
    }

    // Re-add them as they were (mostly SET NULL in original migration)
    const onDelete = (fk.column === 'quotation_format_id') ? "CASCADE" : "SET NULL";

    await queryInterface.addConstraint("quotation_format_custom_section", {
      fields: [fk.column],
      type: "foreign key",
      name: fk.constraint,
      references: {
        table: fk.refTable,
        field: fk.refKey,
      },
      onDelete: onDelete,
      onUpdate: "CASCADE",
    });
  }
}
