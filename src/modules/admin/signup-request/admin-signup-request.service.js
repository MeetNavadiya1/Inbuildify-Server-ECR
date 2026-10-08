import crypto from "crypto";

import { Op, QueryTypes } from "sequelize";

import db from "../../../config/database/models/postgre-models/index.js";
import companyOnboardingService from "../../company-onboarding/company-onboarding.service.js";
import {
  parsePagination,
  withCamelAliases,
  listEnvelope,
  httpError,
  monthBuckets,
  rowTimestamp,
} from "../admin.helper.js";
import sendEmail from "../../../service/sendMail.service.js";
import { wrapAuthEmailHTML } from "../../../templates/auth-email.template.js";
import { env } from "../../../config/env.config.js";

/**
 * Sign-up requests, admin side.
 *
 * The landing site's "Try it" CTAs no longer link at the app's register page —
 * nobody provisions themselves any more. They fill in four fields, that lands in
 * `landing_lead` with `kind = 'signup_request'`, and *releasing* it here is what
 * creates the tenant: `companySignUp` (already pre-verified, so no OTP round
 * trip) plus a generated password emailed to them with the sign-in link. They
 * log in, the app sees `isOnboardingFinished: false` and sends them to the ABN
 * company form, and submitting that finishes onboarding.
 *
 * Rows live on `landing_lead` because that table already models exactly this
 * lifecycle — new → released | rejected, who released it and when, which email
 * it went to, admin notes — for facade enquiries. `kind` keeps the two
 * populations apart; the facade service is scoped to its own kind for the same
 * reason.
 */

const SIGNUP_KIND = "signup_request";

/** Terminal in one direction only: a rejected request re-opens, a released one cannot. */
export const SIGNUP_STAGES = ["new", "released", "rejected", "onboarded", "pending_onboarding"];

export const SIGNUP_SORT_COLUMNS = withCamelAliases({
  name: "name",
  first_name: "first_name",
  last_name: "last_name",
  email: "email",
  created_at: "created_at",
  released_at: "released_at",
  status: "status",
});

/**
 * `onboarded` / `pending_onboarding` split the released population by what the
 * account did next, and that is read off the company itself rather than stored —
 * the same rule the facade screen uses for won/lost. A released request whose
 * company has finished the ABN form is onboarded; one that has not is still
 * pending, which is the queue an admin actually wants to see.
 */
const ONBOARDED_SQL =
  "EXISTS (SELECT 1 FROM company c WHERE c.company_id = \"LandingLead\".\"company_id\" AND c.is_onboarding_finished = true)";

const stageWhere = (stage, sequelize) => {
  if (!stage) return null;
  if (!SIGNUP_STAGES.includes(stage)) {
    throw httpError(400, `stage must be one of ${SIGNUP_STAGES.join(", ")}.`);
  }
  if (stage === "new") return sequelize.literal("\"LandingLead\".\"status\" = 'new'");
  if (stage === "rejected") return sequelize.literal("\"LandingLead\".\"status\" = 'rejected'");
  if (stage === "released") return sequelize.literal("\"LandingLead\".\"status\" = 'released'");
  if (stage === "onboarded") {
    return sequelize.literal(`"LandingLead"."status" = 'released' AND ${ONBOARDED_SQL}`);
  }
  return sequelize.literal(`"LandingLead"."status" = 'released' AND NOT ${ONBOARDED_SQL}`);
};

const buildWhere = (query, sequelize) => {
  const where = { kind: SIGNUP_KIND };
  const and = [];

  const stage = stageWhere(query.stage, sequelize);
  if (stage) and.push(stage);

  if (query.source) where.source = query.source;

  if (query.from || query.to) {
    where.created_at = {};
    if (query.from) where.created_at[Op.gte] = new Date(query.from);
    if (query.to) where.created_at[Op.lte] = new Date(query.to);
  }

  if (query.search) {
    const term = `%${String(query.search).trim()}%`;
    and.push({
      [Op.or]: [
        { name: { [Op.iLike]: term } },
        { first_name: { [Op.iLike]: term } },
        { last_name: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } },
        { phone: { [Op.iLike]: term } },
      ],
    });
  }

  if (and.length) where[Op.and] = and;
  return where;
};

/**
 * What each released request became. Read live, never copied onto the request:
 * the tenant renames itself during onboarding, so a snapshot of the company name
 * taken at release time is wrong by the time anyone reads this screen.
 */
const accountResolver = async (rows) => {
  const { Company, Users } = db;
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))];
  if (!companyIds.length) return () => null;

  const [companies, owners] = await Promise.all([
    Company.findAll({
      attributes: ["company_id", "builder_id", "name", "is_onboarding_finished"],
      where: { company_id: { [Op.in]: companyIds } },
      raw: true,
    }),
    Users.findAll({
      attributes: ["users_id", "company_id", "email", "name", "is_verified"],
      where: { company_id: { [Op.in]: companyIds }, root_user: true, is_deleted: false },
      raw: true,
    }),
  ]);

  const byCompanyId = new Map(companies.map((c) => [c.company_id, c]));
  const ownerByCompanyId = new Map(owners.map((u) => [u.company_id, u]));

  return (row) => {
    const company = byCompanyId.get(row.company_id);
    if (!company) return null;
    const owner = ownerByCompanyId.get(row.company_id) || null;
    return {
      companyId: company.company_id,
      builderId: company.builder_id,
      companyName: company.name,
      isOnboardingFinished: Boolean(company.is_onboarding_finished),
      usersId: owner?.users_id || null,
      userEmail: owner?.email || null,
      userVerified: Boolean(owner?.is_verified),
    };
  };
};

const stageOf = (row, account) => {
  if (row.status === "rejected") return "rejected";
  if (row.status !== "released") return "new";
  return account?.isOnboardingFinished ? "onboarded" : "pending_onboarding";
};

async function shapeSignupRequests(rows) {
  const accountOf = await accountResolver(rows);

  return rows.map((row) => {
    const account = accountOf(row);
    return {
      landingLeadId: row.landing_lead_id,
      firstName: row.first_name,
      lastName: row.last_name,
      name: row.name,
      email: row.email,
      phone: row.phone,
      message: row.notes,
      source: row.source,
      pageUrl: row.page_url,
      utm: {
        source: row.utm_source || null,
        medium: row.utm_medium || null,
        campaign: row.utm_campaign || null,
      },
      status: row.status,
      stage: stageOf(row, account),
      account,
      releasedAt: rowTimestamp(row, "released_at"),
      releasedToEmail: row.released_to_email,
      emailSentAt: rowTimestamp(row, "email_sent_at"),
      rejectedAt: rowTimestamp(row, "rejected_at"),
      adminNotes: row.admin_notes,
      createdAt: rowTimestamp(row, "created_at"),
    };
  });
}

export const listSignupRequestsService = async ({ query }) => {
  const { LandingLead, sequelize } = db;
  const { page, limit, offset } = parsePagination(query);

  const sortColumn = SIGNUP_SORT_COLUMNS[query.sort_by] || "created_at";
  const sortDirection = String(query.sort_dir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const { count, rows } = await LandingLead.findAndCountAll({
    where: buildWhere(query, sequelize),
    order: [[sortColumn, sortDirection]],
    limit,
    offset,
    raw: true,
  });

  return listEnvelope(await shapeSignupRequests(rows), count, page, limit);
};

export const getSignupRequestStatsService = async () => {
  const { LandingLead, sequelize } = db;

  const scope = { kind: SIGNUP_KIND };
  const countStage = (stage) =>
    LandingLead.count({ where: { ...scope, [Op.and]: [stageWhere(stage, sequelize)] } });

  const [total, fresh, released, rejected, onboarded, pending, bySourceRows] = await Promise.all([
    LandingLead.count({ where: scope }),
    countStage("new"),
    countStage("released"),
    countStage("rejected"),
    countStage("onboarded"),
    countStage("pending_onboarding"),
    LandingLead.findAll({
      attributes: ["source", [sequelize.fn("COUNT", sequelize.col("landing_lead_id")), "count"]],
      where: scope,
      group: ["source"],
      raw: true,
    }),
  ]);

  const buckets = monthBuckets(12);

  // One row per month: how many asked, how many were approved, and how many of
  // those went on to finish the ABN form. `onboarded` is a subset of `released`.
  const trend = await sequelize.query(
    `SELECT to_char(date_trunc('month', ll.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS period,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ll.status = 'released')::int AS released,
            COUNT(*) FILTER (WHERE ll.status = 'rejected')::int AS rejected,
            COUNT(*) FILTER (WHERE ll.status = 'released' AND c.is_onboarding_finished = true)::int AS onboarded
       FROM landing_lead ll
       LEFT JOIN company c ON c.company_id = ll.company_id
      WHERE ll.kind = :kind
        AND ll.created_at >= :from
      GROUP BY 1
      ORDER BY 1`,
    { replacements: { kind: SIGNUP_KIND, from: buckets[0].start }, type: QueryTypes.SELECT },
  );

  const trendMap = new Map(trend.map((t) => [t.period, t]));

  return {
    totals: {
      total,
      new: fresh,
      released,
      rejected,
      onboarded,
      pendingOnboarding: pending,
      // Of everything already decided, how much was approved — requests still
      // sitting at "new" are not a rejection and must not drag this down…
      approvalRate: released + rejected
        ? Number(((released / (released + rejected)) * 100).toFixed(1))
        : 0,
      // …and of the accounts handed out, how many were actually set up.
      activationRate: released ? Number(((onboarded / released) * 100).toFixed(1)) : 0,
    },
    trend: buckets.map((b) => ({
      period: b.period,
      total: trendMap.get(b.period)?.total || 0,
      released: trendMap.get(b.period)?.released || 0,
      rejected: trendMap.get(b.period)?.rejected || 0,
      onboarded: trendMap.get(b.period)?.onboarded || 0,
    })),
    bySource: bySourceRows.map((r) => ({ source: r.source || "unknown", count: Number(r.count) })),
  };
};

/**
 * The password that goes in the email.
 *
 * Drawn from `crypto.randomBytes`, not `Math.random`, and assembled so it always
 * holds all four character classes — a password policy that rejects the one
 * credential we just emailed would be an unrecoverable account. The ambiguous
 * glyphs (O/0, l/1/I) are left out because this gets retyped off an email.
 */
const generatePassword = () => {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;

  const pick = (alphabet, count = 1) =>
    Array.from(crypto.randomBytes(count)).map((byte) => alphabet[byte % alphabet.length]);

  const chars = [
    ...pick(upper, 2),
    ...pick(lower, 4),
    ...pick(digits, 3),
    ...pick(symbols, 1),
    ...pick(all, 4),
  ];

  // Fisher-Yates over crypto bytes, so the classes are not always in the same
  // positions.
  const noise = crypto.randomBytes(chars.length);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = noise[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
};

const signInUrl = () => {
  const base = (env.EMAIL?.FRONTEND_BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}/auth/sign-in` : "";
};

const credentialsEmail = ({ firstName, email, password, companyName }) => {
  const subject = "Your inBuildify account is ready";
  const url = signInUrl();

  const text = [
    `Hi${firstName ? ` ${firstName}` : ""},`,
    "",
    "Your inBuildify account has been approved and is ready to use.",
    "",
    companyName ? `Company: ${companyName}` : "",
    `Email: ${email}`,
    `Temporary password: ${password}`,
    "",
    url ? `Sign in: ${url}` : "",
    "",
    "The first time you sign in we'll ask for your company details, including your ABN.",
    "Please change your password from My Profile once you're in.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = wrapAuthEmailHTML({
    subject,
    pillText: "Account Ready",
    bodyHtml: `
      <p style="margin: 0 0 16px;">Hi${firstName ? ` ${firstName}` : ""}, your inBuildify account has been approved and is ready to use.</p>
      <div style="margin: 24px 0; padding: 20px; background-color: #f1f5f9; border-radius: 8px; border: 1px solid #e2e8f0;">
        ${companyName ? `<p style="margin: 0 0 10px; font-size: 15px; color: #1e293b;"><strong>Company:</strong> ${companyName}</p>` : ""}
        <p style="margin: 0 0 10px; font-size: 15px; color: #1e293b;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 0; font-size: 15px; color: #1e293b;"><strong>Temporary password:</strong> <span style="font-family: ui-monospace, Menlo, Consolas, monospace; letter-spacing: 1px;">${password}</span></p>
      </div>
      ${url ? `<p style="margin: 24px 0;"><a href="${url}" style="background-color: #e27d39; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 600;">Sign in to inBuildify</a></p>` : ""}
      <p style="margin: 0 0 8px; color: #475569;">The first time you sign in we'll ask for your company details, including your ABN.</p>
      <p style="margin: 0; color: #475569;">Please change your password from My Profile once you're in.</p>
    `,
  });

  return { subject, text, html };
};

/**
 * Approve a sign-up request: provision the tenant and email the credentials.
 *
 * Idempotent by construction, the same way the facade release is. The row is
 * *claimed* with a conditional UPDATE on `status = 'new'`, so a double-click
 * loses the race and gets a 409 rather than creating a second company. If
 * `companySignUp` then fails the claim is released — the request goes back to
 * "new" instead of being marked approved with no account behind it.
 *
 * A duplicate email is a hard failure here, unlike the facade path where it just
 * points at the builder's existing lead: `companySignUp` throws 409 because a
 * `users` row already holds that address, and there is no second tenant to hand
 * over. The request goes back to "new" and the admin is told why.
 */
export const releaseSignupRequestService = async ({ id, body, admin }) => {
  const { LandingLead, sequelize } = db;

  const row = await LandingLead.findByPk(id, { raw: true });
  if (!row) throw httpError(404, "Sign-up request not found.");
  if (row.kind !== SIGNUP_KIND) throw httpError(404, "Sign-up request not found.");
  if (row.status === "released") throw httpError(409, "This request has already been approved.");
  if (row.status === "rejected") throw httpError(409, "This request was ignored. Re-open it before approving.");

  // The public form asks for four fields and no company name, so the admin
  // supplies one at release time. Falling back to the person's own name keeps
  // the account creatable either way — they can rename the company on the
  // onboarding form, which is the next thing they see.
  const companyName = (body.company_name || row.name || "").trim();
  if (companyName.length < 2) {
    throw httpError(400, "A company name of at least 2 characters is needed to create the account.");
  }

  const toEmail = (body.released_to_email || row.email || "").trim().toLowerCase();
  if (!toEmail) throw httpError(400, "This request has no email address to send the credentials to.");

  const releasedAt = new Date();

  const [, claimed] = await sequelize.query(
    `UPDATE landing_lead
        SET status = 'released',
            released_at = :releasedAt,
            released_by = :releasedBy,
            released_to_email = :toEmail,
            admin_notes = COALESCE(:adminNotes, admin_notes),
            updated_at = :releasedAt
      WHERE landing_lead_id = :id
        AND kind = :kind
        AND status = 'new'`,
    {
      replacements: {
        id,
        kind: SIGNUP_KIND,
        releasedAt,
        releasedBy: admin?.platform_user_id || null,
        toEmail,
        adminNotes: body.admin_notes || null,
      },
    },
  );

  if (!claimed?.rowCount) {
    throw httpError(409, "This request has already been approved.");
  }

  const releaseClaim = async () => {
    await LandingLead.update(
      {
        status: "new",
        released_at: null,
        released_by: null,
        released_to_email: null,
      },
      { where: { landing_lead_id: id } },
    );
  };

  const password = generatePassword();

  let created;
  try {
    created = await companyOnboardingService.companySignUp(
      {
        company_name: companyName,
        email: toEmail,
        password,
        name: row.name,
      },
      // Approved by a platform admin, and the credentials email is what reaches
      // them — an OTP round trip on top would only lock them out of an account
      // we just handed over.
      { preVerified: true },
    );
  } catch (error) {
    await releaseClaim();
    const status = error.statusCode || error.status || 500;
    throw httpError(
      status === 409 ? 409 : 500,
      status === 409
        ? "An account already exists for this email address, so no new one was created."
        : `Could not create the account: ${error.message}`,
    );
  }

  // The company name is not copied onto the request: `accountResolver` reads it
  // off the company itself, so a tenant that renames during onboarding stays
  // consistent with what this screen shows.
  await LandingLead.update(
    {
      company_id: created.companyId,
      builder_id: created.builderId,
    },
    { where: { landing_lead_id: id } },
  );

  // The account exists either way — a mail outage must not undo it. But unlike
  // the facade release, the email IS the only copy of the password, so a failure
  // to send is reported back rather than only logged.
  let emailSentAt = null;
  let emailError = null;
  if (body.send_email !== false) {
    try {
      const message = credentialsEmail({
        firstName: row.first_name,
        email: toEmail,
        password,
        companyName,
      });
      await sendEmail(toEmail, message.subject, message.text, message.html);
      emailSentAt = new Date();
      await LandingLead.update({ email_sent_at: emailSentAt }, { where: { landing_lead_id: id } });
    } catch (error) {
      emailError = error.message;
      console.error("Sign-up credentials email could not be queued:", error.message);
    }
  }

  const fresh = await LandingLead.findByPk(id, { raw: true });
  const [shaped] = await shapeSignupRequests([fresh]);

  return {
    ...shaped,
    emailQueued: Boolean(emailSentAt),
    emailError,
    // Returned once and never stored in readable form (`users.password` is
    // encrypted). If the mail failed this is the only way the admin can pass the
    // credentials on, so the console shows it on the success screen.
    temporaryPassword: password,
  };
};

/** Spam, a competitor, a test submission — parked without creating anything. */
export const rejectSignupRequestService = async ({ id, body }) => {
  const { LandingLead } = db;

  const row = await LandingLead.findByPk(id, { raw: true });
  if (!row) throw httpError(404, "Sign-up request not found.");
  if (row.kind !== SIGNUP_KIND) throw httpError(404, "Sign-up request not found.");
  if (row.status === "released") {
    throw httpError(409, "This request was already approved — the account exists and cannot be ignored.");
  }

  await LandingLead.update(
    { status: "rejected", rejected_at: new Date(), admin_notes: body.admin_notes || row.admin_notes },
    { where: { landing_lead_id: id } },
  );

  const [shaped] = await shapeSignupRequests([await LandingLead.findByPk(id, { raw: true })]);
  return shaped;
};

export const reopenSignupRequestService = async ({ id }) => {
  const { LandingLead } = db;

  const row = await LandingLead.findByPk(id, { raw: true });
  if (!row) throw httpError(404, "Sign-up request not found.");
  if (row.kind !== SIGNUP_KIND) throw httpError(404, "Sign-up request not found.");
  if (row.status !== "rejected") throw httpError(409, "Only an ignored request can be re-opened.");

  await LandingLead.update({ status: "new", rejected_at: null }, { where: { landing_lead_id: id } });

  const [shaped] = await shapeSignupRequests([await LandingLead.findByPk(id, { raw: true })]);
  return shaped;
};

export default {
  listSignupRequestsService,
  getSignupRequestStatsService,
  releaseSignupRequestService,
  rejectSignupRequestService,
  reopenSignupRequestService,
};
