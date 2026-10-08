import { Op } from "sequelize";

import db from "../../config/database/models/postgre-models/index.js";

/**
 * Capture a public landing-site enquiry.
 *
 * The enquiry is recorded in `landing_lead` and stops there, at status `new`.
 * That table is the platform's record of everything the landing site captured,
 * and the admin console reads it — an enquiry belongs to the platform until an
 * admin sells it on.
 *
 * Nothing is delivered to a builder here. Capture used to hand the enquiry
 * straight to the facade's owner, which meant the admin console only ever saw
 * the leftovers — enquiries with no resolvable builder, or ones the builder's
 * own CRM rules refused. Every enquiry now waits for an admin to release it via
 * `src/modules/admin/landing-lead/`, and that release is the only thing that
 * creates the CRM lead in the builder's tenant.
 *
 * The facade's builder is still resolved and stored, because it is the *target*
 * the admin console suggests at release time — it just no longer triggers a
 * hand-off on its own.
 */
export const captureLandingLeadService = async (payload = {}) => {
  const { LandingLead, FeaturFacade, Facade, Company } = db;

  const {
    name,
    email,
    phone,
    notes,
    builder_id: builderId,
    company_id: companyId,
    featur_facade_id: featurFacadeId,
    source,
    page_url: pageUrl,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
  } = payload;

  // The facade row carries the tenant, so a missing builder/company in the body
  // is recoverable — the landing site only sends what its carousel happens to
  // have. This is what the admin console shows as the enquiry's target and
  // pre-fills in the release dialog; it is a suggestion, and the admin can
  // release to a different builder. The facade name is snapshotted because a
  // featured facade can be un-featured or renamed later and the enquiry still
  // has to read sensibly.
  let resolvedBuilderId = builderId || null;
  let resolvedCompanyId = companyId || null;
  let facadeName = null;

  if (featurFacadeId) {
    const featured = await FeaturFacade.findByPk(featurFacadeId, {
      include: [{ model: Facade, as: "facade", attributes: ["name"], required: false }],
    });
    if (featured) {
      const plain = featured.get({ plain: true });
      resolvedBuilderId = resolvedBuilderId || plain.builder_id || null;
      resolvedCompanyId = resolvedCompanyId || plain.company_id || null;
      facadeName = plain.facade?.name || null;
    }
  }

  if (resolvedBuilderId && !resolvedCompanyId) {
    const company = await Company.findOne({
      where: { builder_id: resolvedBuilderId },
      attributes: ["company_id"],
      raw: true,
    });
    resolvedCompanyId = company?.company_id || null;
  }

  const row = await LandingLead.create({
    // Stamped here rather than taken from the body: `source` is free text the
    // landing site sends, so only the endpoint can say which population a row
    // joins. See the sign-up capture below.
    kind: "facade_enquiry",
    name,
    email: email || null,
    phone: phone || null,
    notes: notes || null,
    builder_id: resolvedBuilderId,
    company_id: resolvedCompanyId,
    featur_facade_id: featurFacadeId || null,
    facade_name: facadeName,
    source: source || "landing_facade",
    page_url: pageUrl || null,
    utm_source: utmSource || null,
    utm_medium: utmMedium || null,
    utm_campaign: utmCampaign || null,
    status: "new",
  });

  return {
    landingLeadId: row.landing_lead_id,
    name: row.name,
    // Always `new`. The visitor is told their enquiry was received, which is
    // true; who it ends up with is the admin's call, not something to report
    // back to a marketing page.
    status: row.status,
    // `underscored: true` maps the column, but the attribute is still camelCase
    // on the instance — `row.created_at` reads undefined.
    createdAt: row.createdAt,
  };
};

/**
 * Capture a "Try it" sign-up request from the public landing site.
 *
 * The landing CTAs used to link at the app's register page, so a tenant was
 * provisioned the moment anybody filled that form in. They now land here: the
 * platform owns the request, and releasing it (admin console → Signup requests)
 * is what actually calls `companySignUp` and emails the credentials.
 *
 * No tenant columns are resolved — a sign-up request belongs to nobody yet.
 * `builder_id` / `company_id` stay null until release fills them with what it
 * created, which is the same "the row records what it became" shape the facade
 * kind uses for `released_leads_id`.
 *
 * Re-submitting is deliberately not an error. Someone who fills the form twice
 * because they did not hear back should not get a failure; the admin sees both
 * and releases one. What *is* refused is a request for an email that already has
 * an account, because that person should be signing in.
 */
export const captureSignupRequestService = async (payload = {}) => {
  const { LandingLead, Users, sequelize } = db;

  const {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    message,
    source,
    page_url: pageUrl,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
  } = payload;

  const cleanEmail = String(email).trim().toLowerCase();
  const first = String(firstName).trim();
  const last = String(lastName).trim();

  const existingUser = await Users.findOne({
    where: {
      [Op.and]: [
        sequelize.where(sequelize.fn("LOWER", sequelize.col("email")), cleanEmail),
        { is_deleted: false },
      ],
    },
    attributes: ["users_id"],
    raw: true,
  });

  if (existingUser) {
    const error = new Error(
      "An inBuildify account already exists for this email address. Please sign in instead.",
    );
    error.status = 409;
    throw error;
  }

  const row = await LandingLead.create({
    kind: "signup_request",
    // Both halves are kept because they become a real user account, and `name`
    // is populated too so every list, search and email on this table has one
    // field to read regardless of kind.
    first_name: first,
    last_name: last,
    name: `${first} ${last}`.trim(),
    email: cleanEmail,
    phone: String(phone).trim(),
    notes: message || null,
    // Which CTA sent them ("landing_hero", "landing_pricing_growth", …). The
    // existing `source` column already carries exactly this meaning for the
    // facade kind, so no column was added for it.
    source: source || "landing_cta",
    page_url: pageUrl || null,
    utm_source: utmSource || null,
    utm_medium: utmMedium || null,
    utm_campaign: utmCampaign || null,
    status: "new",
  });

  return {
    landingLeadId: row.landing_lead_id,
    name: row.name,
    email: row.email,
    status: row.status,
    // `underscored: true` maps the column, but the attribute is still camelCase
    // on the instance — `row.created_at` reads undefined.
    createdAt: row.createdAt,
  };
};

/**
 * Capture a "Book a Demo" request from the public landing site.
 *
 * Nothing is created and nothing is checked against `users`: unlike a sign-up
 * request, an existing customer asking for a walkthrough is a perfectly good
 * demo request, so a matching account is not a 409. The row sits at `new` until
 * somebody in the console marks it contacted.
 *
 * No tenant columns are resolved for the same reason the sign-up kind resolves
 * none — this belongs to the platform, not to a builder. The company the
 * visitor typed goes in `company_name`, which is free text; `company_id` is a
 * FK and stays null.
 */
export const captureDemoRequestService = async (payload = {}) => {
  const { LandingLead } = db;

  const {
    name,
    email,
    phone,
    company,
    company_type: companyType,
    message,
    source,
    page_url: pageUrl,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
  } = payload;

  const row = await LandingLead.create({
    kind: "demo_request",
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    phone: String(phone).trim(),
    notes: message || null,
    company_name: company ? String(company).trim() : null,
    company_type: companyType ? String(companyType).trim() : null,
    source: source || "landing_demo",
    page_url: pageUrl || null,
    utm_source: utmSource || null,
    utm_medium: utmMedium || null,
    utm_campaign: utmCampaign || null,
    status: "new",
  });

  return {
    landingLeadId: row.landing_lead_id,
    name: row.name,
    email: row.email,
    status: row.status,
    createdAt: row.createdAt,
  };
};

export default {
  captureLandingLeadService,
  captureSignupRequestService,
  captureDemoRequestService,
};
