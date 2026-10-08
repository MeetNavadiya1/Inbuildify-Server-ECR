import { Model, DataTypes } from "sequelize";

/**
 * The Terms & Conditions attached to ONE quotation version — the row Sync
 * writes (Settings → Terms & Conditions → Sync).
 *
 * It exists for two reasons:
 *
 *   1. It answers "which quotations already have terms?", which is what the
 *      Sync dialog's "All" vs "Only quotations without terms" choice turns on.
 *   2. `terms_snapshot` freezes the wording. A customer who opens the link on a
 *      quotation sent last month must see the terms as they were then, not the
 *      builder's current draft — so the public page serves the snapshot when
 *      one exists and only falls back to the live document when it does not.
 *
 * `public_token` is per quotation, so the link printed in each PDF is unique
 * and resolves straight to that quotation's frozen terms.
 *
 * There is no tenant column pair by accident: quotation_version inherits its
 * tenant through quotation → leads, but a snapshot is written by a specific
 * builder, so it carries builder_id/company_id directly and Sync scopes on the
 * leads join (same as quotation.repository.js).
 */
export class QuotationVersionTerms extends Model {
  static associate(models) {
    QuotationVersionTerms.belongsTo(models.QuotationVersion, {
      foreignKey: "quotation_version_id",
      as: "quotationVersion",
      onDelete: "CASCADE",
    });
    QuotationVersionTerms.belongsTo(models.QuotationTerms, {
      foreignKey: "quotation_terms_id",
      as: "terms",
      onDelete: "SET NULL",
    });
    QuotationVersionTerms.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    QuotationVersionTerms.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  QuotationVersionTerms.init(
    {
      quotation_version_terms_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      quotation_version_id: { type: DataTypes.UUID, allowNull: false, unique: true },
      quotation_terms_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },

      // Frozen copy: { title, intro, sections, footerNote, version }.
      terms_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      // Denormalised out of the snapshot so "is this quote on the latest
      // revision?" is a plain integer compare, not a JSONB dig.
      terms_version: { type: DataTypes.INTEGER, allowNull: true },

      public_token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      synced_at: { type: DataTypes.DATE, allowNull: true },

      // Set when the quotation this freezes is a seeded one. The purge reaches
      // these through their quotation version, so the flag is not what deletes
      // them — it is what makes the read-only guard refuse a main-account Sync
      // that would otherwise re-freeze the builder's wording onto a demo
      // quotation the builder never edited.
      is_sample_data: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },

      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "quotation_version_terms",
      modelName: "QuotationVersionTerms",
      underscored: true,
    },
  );
  return QuotationVersionTerms;
};
