import { Model, DataTypes } from "sequelize";

export default (sequelize) => {
  class QuotationFormat extends Model {
    static associate(models) {
      QuotationFormat.belongsTo(models.Company, {
        foreignKey: "company_id",
        as: "company",
        onDelete: "CASCADE",
      });

      QuotationFormat.belongsTo(models.Builder, {
        foreignKey: "builder_id",
        as: "builderInfo",
        onDelete: "CASCADE",
      });
      QuotationFormat.belongsTo(models.Role, { foreignKey: "role_id", as: "role" });

      QuotationFormat.belongsTo(models.Users, {
        foreignKey: "created_by",
        as: "createdByUser",
        onDelete: "SET NULL",
      });

      QuotationFormat.belongsTo(models.Users, {
        foreignKey: "updated_by",
        as: "updatedByUser",
        onDelete: "SET NULL",
      });

      QuotationFormat.hasMany(models.QuotationFormat, {
        foreignKey: "quotation_format_id",
        as: "QuotationFormat",
        onDelete: "CASCADE",
      });
    }
  }
  QuotationFormat.init(
    {
      quotation_format_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },

      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      builder_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      role_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      format_name: {
        type: DataTypes.STRING(255),
      },

      logo_alignment: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: {
          isIn: [["center", "left", "right"]],
        },
      },

      logo_size_height: {
        type: DataTypes.DECIMAL(10, 2),
      },

      logo_size_width: {
        type: DataTypes.DECIMAL(10, 2),
      },

      logo_padding: {
        type: DataTypes.STRING(255),
      },

      hide_logo_first_page: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      label_logo_size_height: {
        type: DataTypes.DECIMAL(10, 2),
      },

      label_logo_size_width: {
        type: DataTypes.DECIMAL(10, 2),
      },

      show_account: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: {
          isIn: [["company_account", "builder_account"]],
        },
      },

      show_excel: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      // image
      watermark: {
        type: DataTypes.STRING(500),
      },
      // image
      default_facade: {
        type: DataTypes.STRING(500),
      },
      //image
      draft_background_image: {
        type: DataTypes.STRING(500),
      },
      draft_background: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      hide_watermark: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      status: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },

      make_default: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      include_package_price_list: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      show_quotation_with_builder: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      show_quotation_with_builder_detailed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      show_job_address: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      footer_column_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1,
        validate: {
          isIn: [[1, 2, 3]],
        },
      },
      custom_footer: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      bg_color: {
        type: DataTypes.STRING(100),
        defaultValue: null,
      },
      description: {
        type: DataTypes.STRING(255),
      },
      description_2: {
        type: DataTypes.STRING(255),
        defaultValue: null,
      },
      description_3: {
        type: DataTypes.STRING(255),
        defaultValue: null,
      },

      created_by: {
        type: DataTypes.UUID,
      },

      updated_by: {
        type: DataTypes.UUID,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      //   is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },

    {
      sequelize,
      modelName: "QuotationFormat",
      tableName: "quotation_format",
      underscored: true,
      timestamps: true,

      validate: {
        atLeastOneScope() {
          if (!this.company_id && !this.builder_id) {
            throw new Error(
              "Either company_id or builder_id must be provided.",
            );
          }
        },
      },
    },
  );

  return QuotationFormat;
};
