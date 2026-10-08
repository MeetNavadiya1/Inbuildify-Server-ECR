"use strict";

/**
 * `landing_lead` now holds two kinds of platform-owned enquiry, not one.
 *
 * The original kind is a facade enquiry: someone liked a builder's facade, and
 * releasing it creates a CRM lead inside that builder's tenant.
 *
 * The new kind is a sign-up request. The landing site's "Try it" CTAs no longer
 * send anyone to the app's register page — they capture first name, last name,
 * email and phone here, and releasing the row provisions the tenant itself
 * (`companySignUp`) and emails the credentials. Everything the lifecycle needs
 * was already on this table — status new → released | rejected, released_at /
 * released_by / released_to_email / email_sent_at / rejected_at / admin_notes,
 * and company_id + builder_id to point at what the release created — so this is
 * three columns rather than a second table that would duplicate all of it.
 *
 * `kind` is set server-side per endpoint and never read off the request body.
 * `source` looks like it would do the job and does not: it is free text the
 * landing site sends, so a client could label itself into the wrong population.
 *
 * NOT NULL DEFAULT 'facade_enquiry' backfills every existing row to what it
 * already was, which is what lets the existing admin screen keep its numbers —
 * its queries are scoped to that value in the same change.
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

  await addColumnIfMissing(queryInterface, Sequelize, "kind", (S) => ({
    type: S.STRING(20),
    allowNull: false,
    defaultValue: "facade_enquiry",
  }));

  // A facade enquiry has one free-text name and always will — the carousel form
  // asks for one. A sign-up request is asked for both halves because the name
  // becomes a real user account, so these stay nullable rather than being forced
  // on the older kind.
  await addColumnIfMissing(queryInterface, Sequelize, "first_name", (S) => ({
    type: S.STRING(100),
    allowNull: true,
  }));

  await addColumnIfMissing(queryInterface, Sequelize, "last_name", (S) => ({
    type: S.STRING(100),
    allowNull: true,
  }));

  const indexes = await queryInterface.showIndex(LANDING_LEAD);
  if (!indexes.some((index) => index.name === "landing_lead_kind_idx")) {
    await queryInterface.addIndex(LANDING_LEAD, ["kind", "status"], { name: "landing_lead_kind_idx" });
  }
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(LANDING_LEAD)) return;

  const indexes = await queryInterface.showIndex(LANDING_LEAD);
  if (indexes.some((index) => index.name === "landing_lead_kind_idx")) {
    await queryInterface.removeIndex(LANDING_LEAD, "landing_lead_kind_idx");
  }

  const columns = await queryInterface.describeTable(LANDING_LEAD);
  for (const name of ["kind", "first_name", "last_name"]) {
    if (columns[name]) await queryInterface.removeColumn(LANDING_LEAD, name);
  }
}
