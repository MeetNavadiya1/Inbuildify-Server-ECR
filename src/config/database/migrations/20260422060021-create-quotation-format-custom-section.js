export async function up(queryInterface, Sequelize) {
  // Defensive check for the Enum type
  await queryInterface.sequelize.query(`
    DO $$ BEGIN
      CREATE TYPE "enum_quotation_format_custom_section_parent_field" AS ENUM (
        'Facade Name',
        'Property Address',
        'Client Email',
        'Client Mobile'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Defensive check for the table
  const tables = await queryInterface.showAllTables();
  if (tables.includes("quotation_format_custom_section")) return;

  await queryInterface.createTable("quotation_format_custom_section", {
    custom_section_id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      primaryKey: true,
      allowNull: false,
    },
    company_id: {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "company", key: "company_id" },
      onDelete: "SET NULL",
    },
    builder_id: {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "builder", key: "builder_id" },
      onDelete: "SET NULL",
    },
    quotation_format_id: {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "quotation_format", key: "quotation_format_id" },
      onDelete: "CASCADE",
    },
    field_name: {
      type: Sequelize.STRING(255),
      allowNull: false,
    },
    field_label: {
      type: Sequelize.STRING(255),
      allowNull: false,
    },
    is_applicable: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    group_field: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    sort_order: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    parent_field: {
      type: Sequelize.ENUM(
        "Facade Name",
        "Property Address",
        "Client Email",
        "Client Mobile"
      ),
      allowNull: true,
    },
    created_by: {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "users_id" },
      onDelete: "SET NULL",
    },
    updated_by: {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "users_id" },
      onDelete: "SET NULL",
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW()"),
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW()"),
    },
  });

  await queryInterface.addIndex("quotation_format_custom_section", ["company_id"], {
    name: "idx_qfcs_company_id",
  });
  await queryInterface.addIndex("quotation_format_custom_section", ["builder_id"], {
    name: "idx_qfcs_builder_id",
  });
  await queryInterface.addIndex("quotation_format_custom_section", ["quotation_format_id"], {
    name: "idx_qfcs_quotation_format_id",
  });
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.dropTable("quotation_format_custom_section");

  await queryInterface.sequelize.query(`
    DROP TYPE IF EXISTS "enum_quotation_format_custom_section_parent_field";
  `);
}