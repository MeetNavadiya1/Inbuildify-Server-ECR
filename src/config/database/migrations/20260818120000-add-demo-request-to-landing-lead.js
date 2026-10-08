"use strict";

/**
 * A third kind of platform-owned enquiry: `demo_request`.
 *
 * The landing site's "Book a Demo" button was inert — it rendered and did
 * nothing. It now captures name, email, phone, the visitor's company and what
 * kind of business it is, and lands here so the admin console can work the
 * queue. Nothing is provisioned and nothing is released to a builder: somebody
 * calls them and books the demo.
 *
 * Same reasoning as the sign-up request that came before it — `landing_lead`
 * already models the whole lifecycle (status, admin_notes, rejected_at, who
 * did what and when), `kind` keeps the populations apart, and every existing
 * query is either scoped to its own kind or compares `status` by explicit
 * value, so a new kind and a new status value cannot move any existing number.
 *
 * Three columns:
 * - `company_name` — free text off the form. NOT `company_id`, which is a
 *   tenant FK; a demo request belongs to nobody yet, so that stays null.
 * - `company_type` — "Custom builder", "Contractor / trade", … Free text on
 *   purpose: the option list lives in the landing form, and marketing moving
 *   it around must not need a backend release.
 * - `contacted_at` — when an admin marked the request worked. `released_at`
 *   was not reused: on the other two kinds it means a tenant was provisioned
 *   or a CRM lead was created, and a demo booking does neither.
 */

const LANDING_LEAD = "landing_lead";

const addColumnIfMissing = async (queryInterface, Sequelize, name, spec) => {
  const columns = await queryInterface.describeTable(LANDING_LEAD);
  if (columns[name]) return;
  await queryInterface.addColumn(LANDING_LEAD, name, spec(Sequelize));
};

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(LANDING_LEAD)) return;

  await addColumnIfMissing(queryInterface, Sequelize, "company_name", (S) => ({
    type: S.STRING(255),
    allowNull: true,
  }));

  await addColumnIfMissing(queryInterface, Sequelize, "company_type", (S) => ({
    type: S.STRING(60),
    allowNull: true,
  }));

  await addColumnIfMissing(queryInterface, Sequelize, "contacted_at", (S) => ({
    type: S.DATE,
    allowNull: true,
  }));

  // No new index: `landing_lead_kind_idx` is already on (kind, status), which is
  // exactly how this screen filters.
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(LANDING_LEAD)) return;

  const columns = await queryInterface.describeTable(LANDING_LEAD);
  for (const name of ["company_name", "company_type", "contacted_at"]) {
    if (columns[name]) await queryInterface.removeColumn(LANDING_LEAD, name);
  }
}
