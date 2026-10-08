import db from "../../config/database/models/postgre-models/index.js";
import { wrapAuthEmailHTML } from "../../templates/auth-email.template.js";
import { env } from "../../config/env.config.js";

/**
 * Working out who a captured facade enquiry goes to, and what they are told.
 *
 * Only the admin release endpoint uses this now. The public capture endpoint
 * used to deliver straight away when the facade named a builder, and shared
 * these helpers to do it; releasing is deliberately the one path that hands an
 * enquiry to a builder, so the lead creation and notification themselves live
 * with that flow in `src/modules/admin/landing-lead/`. What is left here is the
 * target resolution and the email body.
 */

/**
 * The tenant's account owner. Used twice: as the fallback address for the
 * notification email, and as the `userId` the CRM lead is created under.
 *
 * That second use matters. `createLead` stamps `created_by`, `updated_by` and
 * `assignee_id` from its `userId` argument, so passing null leaves the lead with
 * no owner at all — invisible to the Sales Executive and Agent row scopes
 * (`applyRowScope` filters on exactly those two columns) and showing a blank
 * creator in the CRM. It should arrive owned.
 */
export const resolveTenantOwner = async (builderId, companyId) => {
  const { Users } = db;

  const where = { is_deleted: false, root_user: true };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;
  else return null;

  return Users.findOne({ where, attributes: ["users_id", "email"], raw: true });
};

/**
 * Who the notification goes to: whatever the admin typed, else the builder
 * record's own address, else the tenant's account owner.
 */
export const resolveBuilderEmail = async (builderId, owner, override) => {
  if (override) return override;
  const { Builder } = db;

  if (builderId) {
    const builder = await Builder.findByPk(builderId, { attributes: ["email"], raw: true });
    if (builder?.email) return builder.email;
  }

  return owner?.email || null;
};

export const buildReleaseEmail = ({ lead, builderName, facadeName, referenceNumber }) => {
  const subject = `New enquiry from the inBuildify website: ${lead.name}`;
  const appUrl = env.EMAIL?.FRONTEND_BASE_URL || "";
  const rows = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Facade", facadeName],
    ["Reference", referenceNumber],
  ].filter(([, value]) => value);

  const text = [
    `Hello${builderName ? ` ${builderName}` : ""},`,
    "",
    "An enquiry from the inBuildify website has landed in your account and is now in your Leads list.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    lead.notes ? `\nWhat they asked for:\n${lead.notes}` : "",
    appUrl ? `\nOpen your CRM: ${appUrl}` : "",
  ].join("\n");

  const html = wrapAuthEmailHTML({
    subject,
    pillText: "New Lead",
    bodyHtml: `
      <p style="margin: 0 0 16px;">An enquiry from the inBuildify website has landed in your account. It is now in your Leads list.</p>
      <div style="margin: 24px 0; padding: 20px; background-color: #f1f5f9; border-radius: 8px; border: 1px solid #e2e8f0;">
        ${rows.map(([label, value]) => `<p style="margin: 0 0 10px; font-size: 15px; color: #1e293b;"><strong>${label}:</strong> ${value}</p>`).join("")}
      </div>
      ${lead.notes ? `<p style="margin: 0 0 8px; font-weight: 600; color: #1e293b;">What they asked for</p><p style="margin: 0 0 16px; color: #475569;">${lead.notes}</p>` : ""}
      ${appUrl ? `<p style="margin: 24px 0 0;"><a href="${appUrl}" style="background-color: #e27d39; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open your CRM</a></p>` : ""}
    `,
  });

  return { subject, text, html };
};

export default {
  resolveTenantOwner,
  resolveBuilderEmail,
  buildReleaseEmail,
};
