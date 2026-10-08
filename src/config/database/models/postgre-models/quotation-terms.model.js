import { Model, DataTypes } from "sequelize";

/**
 * A builder's Terms & Conditions document (Settings → Terms & Conditions).
 *
 * One row per builder/company — the terms are the tenant's, not a per-quotation
 * thing, so every user who logs in under the same builder edits (and every
 * quotation links to) the same document.
 *
 * The one exception is Sample Data, which holds a second, `is_sample_data` row
 * per importer. It is the demo quotations' document and nothing else's: the
 * editor, Sync and the builder's public link all filter it out, so the two can
 * never be edited or published into one another. See `is_sample_data` below.
 *
 * The document has a FIXED format: a title, an intro paragraph, an ordered list
 * of clauses the builder adds, and a closing note. The builder supplies the
 * words; the renderer (utils/quotationTermsTemplate.js) supplies the structure,
 * so every builder's terms page looks the same and cannot be broken by input.
 *
 * `public_token` is the opaque id in the customer-facing URL
 * `${FRONTEND_BASE_URL}/terms/<token>`. It lives here — not only on the
 * per-quotation snapshot — so a quotation that was never synced still has a
 * working link in its PDF.
 */
export class QuotationTerms extends Model {
  static associate(models) {
    QuotationTerms.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    QuotationTerms.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    QuotationTerms.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    QuotationTerms.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  QuotationTerms.init(
    {
      quotation_terms_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },

      // Document heading, e.g. "Terms & Conditions of Sale".
      title: { type: DataTypes.STRING(255), allowNull: false, defaultValue: "Terms & Conditions" },
      // Opening paragraph shown above the numbered clauses. Sanitised HTML.
      intro: { type: DataTypes.TEXT, allowNull: true },
      // The clauses the builder adds: [{ id, title, body }] — body is sanitised
      // HTML, title is plain text. Order in the array is the printed order.
      sections: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      // Closing note under the clauses (acceptance wording, contact line, …).
      footer_note: { type: DataTypes.TEXT, allowNull: true },

      // What Confirm PUBLISHED: { title, intro, sections, footerNote, version }.
      //
      // The columns above are the builder's working draft — "Save draft"
      // rewrites them freely. Customers must not see those edits, so everything
      // customer-facing (the public page on the builder token, Sync's frozen
      // copy, the title printed on the PDF) reads this snapshot instead. Without
      // it, saving a draft silently republished half-written wording to every
      // quotation that had not been synced.
      confirmed_snapshot: { type: DataTypes.JSONB, allowNull: true },

      // Bumped on every Confirm. Snapshots record the version they froze, so a
      // customer's link can be traced back to the exact revision they saw.
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      // false until the builder hits Confirm at least once. An unconfirmed
      // document is a draft: it is never pushed onto quotations by Sync and the
      // public page refuses to render it.
      is_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      confirmed_at: { type: DataTypes.DATE, allowNull: true },

      // Opaque public id (see class doc). Unique across all builders.
      public_token: { type: DataTypes.STRING(64), allowNull: false, unique: true },

      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

      // Flags the document the sample-data importer wrote (Settings → Sample
      // Data). It is a SECOND document alongside the builder's own, not the same
      // row: the demo quotations resolve to this one, Settings → Terms &
      // Conditions edits the other, and neither can reach the other's wording.
      // `sample_data_owner_id` is whose import it belongs to, so one person
      // clearing their sample data cannot take a colleague's demo terms away.
      is_sample_data: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },

      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "quotation_terms",
      modelName: "QuotationTerms",
      underscored: true,
    },
  );
  return QuotationTerms;
};
