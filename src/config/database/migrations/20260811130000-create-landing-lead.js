"use strict";

/**
 * Landing-page enquiries stop being a builder's CRM lead on arrival.
 *
 * "Get Quote" used to call `POST /leads/public/create`, which wrote straight
 * into `leads` under the facade owner's builder_id — the builder had the lead
 * for free, the moment it was captured. The platform sells those enquiries, so
 * they now land here first and only become a `leads` row when an admin releases
 * them (`released_leads_id` points at the row that was created).
 *
 * A separate table rather than a parked `leads` row with a NULL tenant:
 * `createLead` scopes its duplicate-email check and its reference number by
 * builder, so a tenant-less lead gets junk on both, and the release lifecycle
 * (amount charged, who released it, when) has no home on `leads`.
 *
 * No backfill: `featured_facade_lead` is empty, so no landing enquiry has ever
 * been captured on this database.
 */

const uuidPk = (Sequelize) => ({
  type: Sequelize.UUID,
  defaultValue: Sequelize.literal("gen_random_uuid()"),
  primaryKey: true,
  allowNull: false,
});

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
});

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (existing.includes("landing_lead")) return;

  await queryInterface.createTable("landing_lead", {
    landing_lead_id: uuidPk(Sequelize),

    name: { type: Sequelize.STRING(255), allowNull: false },
    email: { type: Sequelize.STRING(255), allowNull: true },
    phone: { type: Sequelize.STRING(50), allowNull: true },
    notes: { type: Sequelize.TEXT, allowNull: true },

    // Who the enquiry is *for*. Nullable on purpose: a facade can be featured
    // without a resolvable owner, and an enquiry with no target is still worth
    // capturing — the admin picks a builder at release time.
    builder_id: { type: Sequelize.UUID, allowNull: true },
    company_id: { type: Sequelize.UUID, allowNull: true },
    featur_facade_id: { type: Sequelize.UUID, allowNull: true },
    facade_name: { type: Sequelize.STRING(255), allowNull: true },

    source: { type: Sequelize.STRING(50), allowNull: false, defaultValue: "landing_facade" },
    page_url: { type: Sequelize.STRING(500), allowNull: true },
    utm_source: { type: Sequelize.STRING(120), allowNull: true },
    utm_medium: { type: Sequelize.STRING(120), allowNull: true },
    utm_campaign: { type: Sequelize.STRING(120), allowNull: true },

    // new → released | rejected. Won/lost is never stored here; it is read off
    // the released lead's opportunity, so the admin console and the builder's
    // CRM can never disagree.
    status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "new" },

    released_at: { type: Sequelize.DATE, allowNull: true },
    released_by: { type: Sequelize.UUID, allowNull: true },
    released_leads_id: { type: Sequelize.UUID, allowNull: true },
    released_to_email: { type: Sequelize.STRING(255), allowNull: true },
    release_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
    release_currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: "AUD" },
    release_method: { type: Sequelize.STRING(20), allowNull: true },
    email_sent_at: { type: Sequelize.DATE, allowNull: true },

    rejected_at: { type: Sequelize.DATE, allowNull: true },
    admin_notes: { type: Sequelize.TEXT, allowNull: true },

    ...timestamps(Sequelize),
  });

  await queryInterface.addIndex("landing_lead", ["status"], { name: "landing_lead_status_idx" });
  await queryInterface.addIndex("landing_lead", ["builder_id"], { name: "landing_lead_builder_idx" });
  await queryInterface.addIndex("landing_lead", ["company_id"], { name: "landing_lead_company_idx" });
  await queryInterface.addIndex("landing_lead", ["created_at"], { name: "landing_lead_created_at_idx" });
  await queryInterface.addIndex("landing_lead", ["released_leads_id"], { name: "landing_lead_released_lead_idx" });
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (existing.includes("landing_lead")) await queryInterface.dropTable("landing_lead");
}
