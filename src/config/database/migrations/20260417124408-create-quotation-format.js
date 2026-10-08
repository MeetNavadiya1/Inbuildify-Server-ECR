"use strict";

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("quotation_format")) return;
    await queryInterface.createTable("quotation_format", {
      quotation_format_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },

      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "company",
          key: "company_id",
        },
        onDelete: "CASCADE",
      },

      master_section_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "master_section",
          key: "master_section_id",
        },
        onDelete: "CASCADE",
      },

      builder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "builder",
          key: "builder_id",
        },
        onDelete: "CASCADE",
      },

      role_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "role",
          key: "role_id",
        },
        onDelete: "SET NULL",
      },

      format_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      logo_alignment: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      logo_size_height: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },

      logo_size_width: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },

      logo_padding: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      hide_logo_first_page: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },

      label_logo_size_height: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },

      label_logo_size_width: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },

      show_account: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      show_excel: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },

      watermark: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },

      default_facade: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },

      draft_background: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },

      hide_watermark: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },

      status: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      },

      make_default: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },

      include_package_price_list: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },

      show_quotation_with_builder: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },

      show_job_address: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },

      footer_column_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 1,
      },

      custom_footer: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: true,
      },

      bg_color: {
        type: Sequelize.STRING(100),
        defaultValue: null,
        allowNull: true,
      },

      description: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "users_id",
        },
        onDelete: "SET NULL",
      },

      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "users_id",
        },
        onDelete: "SET NULL",
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Indexes
    await queryInterface.addIndex("quotation_format", ["company_id"], {
      name: "idx_quotation_format_company_id",
    });

    await queryInterface.addIndex("quotation_format", ["builder_id"], {
      name: "idx_quotation_format_builder_id",
    });
    await queryInterface.addIndex("quotation_format", ["master_section_id"], {
      name: "idx_quotation_format_master_section_id",
    });

    await queryInterface.addIndex("quotation_format", ["role_id"], {
      name: "idx_quotation_format_role_id",
    });

    await queryInterface.addIndex("quotation_format", ["created_by"], {
      name: "idx_quotation_format_created_by",
    });

    await queryInterface.addIndex("quotation_format", ["status"], {
      name: "idx_quotation_format_status",
    });

    // Constraints
    await queryInterface.sequelize.query(`
      ALTER TABLE quotation_format
        ADD CONSTRAINT chk_logo_alignment
        CHECK (logo_alignment IN ('center', 'left', 'right'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE quotation_format
        ADD CONSTRAINT chk_show_account
        CHECK (show_account IN ('company_account', 'builder_account'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE quotation_format
        ADD CONSTRAINT chk_footer_column_count
        CHECK (footer_column_count IN (1, 2, 3));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE quotation_format
        ADD CONSTRAINT chk_at_least_one_scope
        CHECK (company_id IS NOT NULL OR builder_id IS NOT NULL);
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE quotation_format DROP CONSTRAINT IF EXISTS chk_at_least_one_scope;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE quotation_format DROP CONSTRAINT IF EXISTS chk_footer_column_count;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE quotation_format DROP CONSTRAINT IF EXISTS chk_show_account;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE quotation_format DROP CONSTRAINT IF EXISTS chk_logo_alignment;
    `);

    await queryInterface.dropTable("quotation_format");
  },
};