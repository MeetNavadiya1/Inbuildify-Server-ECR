import { Model, DataTypes } from "sequelize";

/**
 * Anything the public landing site captures and the platform owns until an
 * admin acts on it. `kind` says which of the three it is, and that decides what
 * acting on it does:
 *
 * - `facade_enquiry` — a "Get Quote" on a builder's facade. Release creates a
 *   real CRM lead in that builder's tenant and `released_leads_id` points at it.
 *   Won/lost is never stored here; it is read off that lead's opportunity.
 * - `signup_request` — a "Try it" on the landing site. Release provisions a
 *   whole new tenant via `companySignUp` and emails the credentials;
 *   `company_id` / `builder_id` then point at what was created.
 * - `demo_request` — a "Book a Demo" on the landing site. Nothing is created:
 *   sales rings them, and the row moves new → contacted (or rejected). It is
 *   the only kind that uses `contacted_at`, `company_name` and `company_type`.
 */
export class LandingLead extends Model {
  static associate(models) {
    LandingLead.belongsTo(models.Company, { foreignKey: "company_id", as: "company", constraints: false });
    LandingLead.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", constraints: false });
    LandingLead.belongsTo(models.Leads, { foreignKey: "released_leads_id", as: "releasedLead", constraints: false });
    LandingLead.belongsTo(models.FeaturFacade, { foreignKey: "featur_facade_id", as: "featuredFacade", constraints: false });
  }
}

// export const LANDING_LEAD_STATUSES = ["new", "released", "rejected"];
/**
 * `contacted` belongs to `demo_request` alone — nothing is released when a demo
 * is booked. It is added to the shared list rather than kept in a per-kind one
 * because this is the column's `isIn` validator; every reader either scopes by
 * kind or compares an explicit value, so the older kinds cannot see it.
 */
export const LANDING_LEAD_STATUSES = ["new", "released", "contacted", "rejected"];

// export const LANDING_LEAD_KINDS = ["facade_enquiry", "signup_request"];
export const LANDING_LEAD_KINDS = ["facade_enquiry", "signup_request", "demo_request"];

export default (sequelize) => {
  LandingLead.init(
    {
      landing_lead_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      kind: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "facade_enquiry",
        validate: { isIn: [LANDING_LEAD_KINDS] },
      },

      name: { type: DataTypes.STRING(255), allowNull: false },
      // Only a signup_request carries the two halves; the facade form asks for
      // one free-text name. `name` is always populated for both so every list,
      // search and email has a single field to read.
      first_name: { type: DataTypes.STRING(100), allowNull: true },
      last_name: { type: DataTypes.STRING(100), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(50), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },

      // What the visitor typed, not a tenant. `company_id` below is the FK and
      // stays null for a demo request — nobody owns it yet.
      company_name: { type: DataTypes.STRING(255), allowNull: true },
      company_type: { type: DataTypes.STRING(60), allowNull: true },

      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      featur_facade_id: { type: DataTypes.UUID, allowNull: true },
      facade_name: { type: DataTypes.STRING(255), allowNull: true },

      source: { type: DataTypes.STRING(50), allowNull: false, defaultValue: "landing_facade" },
      page_url: { type: DataTypes.STRING(500), allowNull: true },
      utm_source: { type: DataTypes.STRING(120), allowNull: true },
      utm_medium: { type: DataTypes.STRING(120), allowNull: true },
      utm_campaign: { type: DataTypes.STRING(120), allowNull: true },

      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "new",
        validate: { isIn: [LANDING_LEAD_STATUSES] },
      },

      released_at: { type: DataTypes.DATE, allowNull: true },
      released_by: { type: DataTypes.UUID, allowNull: true },
      released_leads_id: { type: DataTypes.UUID, allowNull: true },
      released_to_email: { type: DataTypes.STRING(255), allowNull: true },
      release_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      release_currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: "AUD" },
      release_method: { type: DataTypes.STRING(20), allowNull: true },
      email_sent_at: { type: DataTypes.DATE, allowNull: true },

      // `demo_request` only — when sales marked it worked.
      contacted_at: { type: DataTypes.DATE, allowNull: true },

      rejected_at: { type: DataTypes.DATE, allowNull: true },
      admin_notes: { type: DataTypes.TEXT, allowNull: true },

      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "landing_lead",
      modelName: "LandingLead",
      underscored: true,
    },
  );
  return LandingLead;
};
