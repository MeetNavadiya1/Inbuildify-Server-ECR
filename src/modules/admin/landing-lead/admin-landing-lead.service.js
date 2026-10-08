import { Op, QueryTypes } from "sequelize";

import db from "../../../config/database/models/postgre-models/index.js";
import leadsService from "../../lead/leads.service.js";
import { wonFor, lostFor } from "../lead/admin-lead.service.js";
import {
  parsePagination,
  withCamelAliases,
  listEnvelope,
  httpError,
  monthBuckets,
  rowTimestamp,
  toNumber,
} from "../admin.helper.js";
import {
  resolveTenantOwner,
  resolveBuilderEmail,
  buildReleaseEmail,
} from "../../landing-lead/landing-lead.delivery.js";
import sendEmail from "../../../service/sendMail.service.js";

/**
 * The landing marketplace, admin side.
 *
 * A "Get Quote" enquiry is captured as a `landing_lead` and arrives on this
 * screen as `new` — every one of them, whether or not the facade named a
 * builder. The capture endpoint delivers nothing; releasing is the only way an
 * enquiry reaches a builder. Doing so creates the real CRM lead in that
 * builder's tenant, records which lead it became, and sets the commercial
 * fields (`release_amount`, `release_method`) that only an admin can set.
 *
 * Where the facade named a builder, that builder is already on the row as the
 * suggested target; the admin can release to a different one by passing
 * `builderId`.
 *
 * From then on the outcome is *read* off that lead, never stored here, so this
 * screen and Won/Lost can never disagree.
 */

/** Derived, not stored. `released` means the builder has it and has not closed it. */
export const LANDING_STAGES = ["new", "released", "won", "lost", "rejected"];

/** This screen is the facade half of `landing_lead`; sign-up requests are their own screen. */
const LANDING_LEAD_KIND = "facade_enquiry";

const RELEASED_LEAD = "\"LandingLead\".\"released_leads_id\"";
const WON_SQL = wonFor(RELEASED_LEAD);
const LOST_SQL = lostFor(RELEASED_LEAD);

const stageWhere = (stage, sequelize) => {
  if (!stage) return null;
  if (!LANDING_STAGES.includes(stage)) {
    throw httpError(400, `stage must be one of ${LANDING_STAGES.join(", ")}.`);
  }
  if (stage === "new") return sequelize.literal("\"LandingLead\".\"status\" = 'new'");
  if (stage === "rejected") return sequelize.literal("\"LandingLead\".\"status\" = 'rejected'");
  if (stage === "won") return sequelize.literal(`"LandingLead"."status" = 'released' AND ${WON_SQL} AND NOT ${LOST_SQL}`);
  if (stage === "lost") return sequelize.literal(`"LandingLead"."status" = 'released' AND ${LOST_SQL}`);
  return sequelize.literal(`"LandingLead"."status" = 'released' AND NOT ${WON_SQL} AND NOT ${LOST_SQL}`);
};

export const LANDING_SORT_COLUMNS = withCamelAliases({
  name: "name",
  created_at: "created_at",
  released_at: "released_at",
  release_amount: "release_amount",
  status: "status",
});

const buildWhere = (query, sequelize) => {
  // const where = {};
  // `landing_lead` also holds sign-up requests now (see the signup-request admin
  // module). Every query in this file is scoped to the facade kind, or this
  // screen's tiles start counting rows that belong to the other one — an
  // unreleased sign-up would read as an unsold facade enquiry.
  const where = { kind: LANDING_LEAD_KIND };
  const and = [];

  const stage = stageWhere(query.stage, sequelize);
  if (stage) and.push(stage);

  if (query.builder_id) where.builder_id = query.builder_id;
  if (query.company_id) where.company_id = query.company_id;
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
        { email: { [Op.iLike]: term } },
        { phone: { [Op.iLike]: term } },
        { facade_name: { [Op.iLike]: term } },
      ],
    });
  }

  if (and.length) where[Op.and] = and;
  return where;
};

/** company_id and builder_id are not interchangeable — resolve both directions. */
const targetResolver = async (rows) => {
  const { Company, Builder } = db;
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))];
  const builderIds = [...new Set(rows.map((r) => r.builder_id).filter(Boolean))];

  const [companies, builders] = await Promise.all([
    companyIds.length || builderIds.length
      ? Company.findAll({
        attributes: ["company_id", "builder_id", "name"],
        where: {
          [Op.or]: [
            ...(companyIds.length ? [{ company_id: { [Op.in]: companyIds } }] : []),
            ...(builderIds.length ? [{ builder_id: { [Op.in]: builderIds } }] : []),
          ],
        },
        raw: true,
      })
      : [],
    builderIds.length
      ? Builder.findAll({ attributes: ["builder_id", "name", "email"], where: { builder_id: { [Op.in]: builderIds } }, raw: true })
      : [],
  ]);

  const byCompanyId = new Map(companies.map((c) => [c.company_id, c]));
  const byBuilderId = new Map(companies.map((c) => [c.builder_id, c]));
  const builderById = new Map(builders.map((b) => [b.builder_id, b]));

  return (row) => {
    const company = byCompanyId.get(row.company_id) || byBuilderId.get(row.builder_id) || null;
    const builder = builderById.get(row.builder_id) || null;
    if (!company && !builder) return null;
    return {
      companyId: company?.company_id || row.company_id || null,
      builderId: builder?.builder_id || company?.builder_id || row.builder_id || null,
      name: builder?.name || company?.name || null,
      email: builder?.email || null,
    };
  };
};

const stageOf = (row, wonIds, lostIds) => {
  if (row.status === "rejected") return "rejected";
  if (row.status !== "released") return "new";
  if (lostIds.has(row.released_leads_id)) return "lost";
  if (wonIds.has(row.released_leads_id)) return "won";
  return "released";
};

async function shapeLandingLeads(rows) {
  const { Opportunity, Leads } = db;
  const leadIds = rows.map((r) => r.released_leads_id).filter(Boolean);

  const [targetOf, opportunities, releasedLeads] = await Promise.all([
    targetResolver(rows),
    leadIds.length
      ? Opportunity.findAll({ where: { leads_id: { [Op.in]: leadIds } }, raw: true })
      : [],
    leadIds.length
      ? Leads.findAll({
        where: { leads_id: { [Op.in]: leadIds } },
        attributes: ["leads_id", "reference_number", "status", "lead_lost_reason_id"],
        raw: true,
      })
      : [],
  ]);

  const wonIds = new Set(opportunities.filter((o) => o.out_come === "won").map((o) => o.leads_id));
  const lostIds = new Set([
    ...opportunities.filter((o) => o.out_come === "lost").map((o) => o.leads_id),
    ...releasedLeads.filter((l) => l.lead_lost_reason_id).map((l) => l.leads_id),
  ]);
  const leadById = new Map(releasedLeads.map((l) => [l.leads_id, l]));

  return rows.map((row) => ({
    landingLeadId: row.landing_lead_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    facadeName: row.facade_name,
    featurFacadeId: row.featur_facade_id,
    source: row.source,
    pageUrl: row.page_url,
    utm: {
      source: row.utm_source || null,
      medium: row.utm_medium || null,
      campaign: row.utm_campaign || null,
    },
    status: row.status,
    stage: stageOf(row, wonIds, lostIds),
    target: targetOf(row),
    releasedAt: rowTimestamp(row, "released_at"),
    releasedToEmail: row.released_to_email,
    releaseAmount: row.release_amount === null || row.release_amount === undefined
      ? null
      : Number(row.release_amount),
    releaseCurrency: row.release_currency,
    releaseMethod: row.release_method,
    emailSentAt: rowTimestamp(row, "email_sent_at"),
    adminNotes: row.admin_notes,
    createdAt: rowTimestamp(row, "created_at"),
    releasedLead: row.released_leads_id
      ? {
        leadsId: row.released_leads_id,
        referenceNumber: leadById.get(row.released_leads_id)?.reference_number || null,
        status: leadById.get(row.released_leads_id)?.status || null,
      }
      : null,
  }));
}

export const listLandingLeadsService = async ({ query }) => {
  const { LandingLead, sequelize } = db;
  const { page, limit, offset } = parsePagination(query);

  const sortColumn = LANDING_SORT_COLUMNS[query.sort_by] || "created_at";
  const sortDirection = String(query.sort_dir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const { count, rows } = await LandingLead.findAndCountAll({
    where: buildWhere(query, sequelize),
    order: [[sortColumn, sortDirection]],
    limit,
    offset,
    raw: true,
  });

  return listEnvelope(await shapeLandingLeads(rows), count, page, limit);
};

export const getLandingLeadStatsService = async ({ query }) => {
  const { LandingLead, sequelize } = db;

  // const scope = {};
  const scope = { kind: LANDING_LEAD_KIND };
  if (query.builder_id) scope.builder_id = query.builder_id;
  if (query.company_id) scope.company_id = query.company_id;

  const countStage = (stage) =>
    LandingLead.count({ where: { ...scope, [Op.and]: [stageWhere(stage, sequelize)] } });

  const [total, fresh, released, won, lost, rejected, revenueRow, bySourceRows, byBuilderRows] = await Promise.all([
    LandingLead.count({ where: scope }),
    countStage("new"),
    countStage("released"),
    countStage("won"),
    countStage("lost"),
    countStage("rejected"),
    LandingLead.findAll({
      attributes: [[sequelize.fn("COALESCE", sequelize.fn("SUM", sequelize.col("release_amount")), 0), "amount"]],
      where: { ...scope, status: "released" },
      raw: true,
    }),
    LandingLead.findAll({
      attributes: ["source", [sequelize.fn("COUNT", sequelize.col("landing_lead_id")), "count"]],
      where: scope,
      group: ["source"],
      raw: true,
    }),
    LandingLead.findAll({
      attributes: ["builder_id", [sequelize.fn("COUNT", sequelize.col("landing_lead_id")), "count"]],
      where: scope,
      group: ["builder_id"],
      raw: true,
    }),
  ]);

  const builderNames = await targetResolver(byBuilderRows.map((r) => ({ builder_id: r.builder_id, company_id: null })));

  const buckets = monthBuckets(12);
  const scopeSql = [
    query.builder_id ? "AND ll.builder_id = :builderId" : "",
    query.company_id ? "AND ll.company_id = :companyId" : "",
  ].join(" ");

  // One row per month: how many arrived, how many were released, and what those
  // released ones went on to do. `sold` is a subset of `total`, not a sibling.
  const trend = await sequelize.query(
    `SELECT to_char(date_trunc('month', ll.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS period,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ll.status = 'released')::int AS released,
            COUNT(*) FILTER (WHERE ll.status = 'released' AND o.out_come = 'won')::int AS won,
            COUNT(*) FILTER (WHERE ll.status = 'released' AND (o.out_come = 'lost' OR l.lead_lost_reason_id IS NOT NULL))::int AS lost,
            COALESCE(SUM(ll.release_amount) FILTER (WHERE ll.status = 'released'), 0)::float AS revenue
       FROM landing_lead ll
       LEFT JOIN leads l ON l.leads_id = ll.released_leads_id
       LEFT JOIN LATERAL (
         SELECT out_come FROM opportunity WHERE leads_id = ll.released_leads_id ORDER BY created_at DESC LIMIT 1
       ) o ON true
      WHERE ll.created_at >= :from
        AND ll.kind = '${LANDING_LEAD_KIND}'
        ${scopeSql}
      GROUP BY 1
      ORDER BY 1`,
    {
      replacements: {
        from: buckets[0].start,
        builderId: query.builder_id || null,
        companyId: query.company_id || null,
      },
      type: QueryTypes.SELECT,
    },
  );

  const trendMap = new Map(trend.map((t) => [t.period, t]));
  const closed = won + lost;

  return {
    totals: {
      total,
      new: fresh,
      released,
      won,
      lost,
      rejected,
      revenue: toNumber(revenueRow?.[0]?.amount),
      currency: "AUD",
      // Of everything captured, how much has been sold on…
      releaseRate: total ? Number((((released + won + lost) / total) * 100).toFixed(1)) : 0,
      // …and of what the builders actually closed, how much they won.
      winRate: closed ? Number(((won / closed) * 100).toFixed(1)) : 0,
    },
    trend: buckets.map((b) => ({
      period: b.period,
      total: trendMap.get(b.period)?.total || 0,
      released: trendMap.get(b.period)?.released || 0,
      won: trendMap.get(b.period)?.won || 0,
      lost: trendMap.get(b.period)?.lost || 0,
      revenue: trendMap.get(b.period)?.revenue || 0,
    })),
    bySource: bySourceRows.map((r) => ({ source: r.source || "unknown", count: Number(r.count) })),
    byBuilder: byBuilderRows.map((r) => ({
      builderId: r.builder_id,
      name: builderNames({ builder_id: r.builder_id, company_id: null })?.name || "Unassigned",
      count: Number(r.count),
    })),
  };
};

/**
 * Hand a captured enquiry to a builder.
 *
 * Idempotent by construction: the row is *claimed* with a conditional UPDATE on
 * `status = 'new'`, so a double-click loses the race and gets a 409 instead of
 * creating a second CRM lead. `createLead` runs its own transaction, so if the
 * lead cannot be created the claim is released again — the enquiry goes back to
 * "new" rather than being marked sold with nothing to show for it. The email is
 * queued only after the lead exists.
 */
export const releaseLandingLeadService = async ({ id, body, admin }) => {
  const { LandingLead, Company, sequelize } = db;

  const row = await LandingLead.findByPk(id, { raw: true });
  if (!row) throw httpError(404, "Landing lead not found.");
  // Releasing a sign-up request provisions a tenant, not a lead — a caller that
  // reaches this route with one has the wrong id, not a releasable enquiry.
  if (row.kind !== LANDING_LEAD_KIND) throw httpError(404, "Landing lead not found.");
  if (row.status === "released") throw httpError(409, "This enquiry has already been released to a builder.");
  if (row.status === "rejected") throw httpError(409, "This enquiry was rejected. Re-open it before releasing.");

  let builderId = body.builder_id || row.builder_id || null;
  let companyId = body.company_id || row.company_id || null;

  // A target may be given either way round; fill in the half that is missing.
  if (builderId && !companyId) {
    const company = await Company.findOne({ where: { builder_id: builderId }, attributes: ["company_id"], raw: true });
    companyId = company?.company_id || null;
  } else if (companyId && !builderId) {
    const company = await Company.findByPk(companyId, { attributes: ["builder_id"], raw: true });
    builderId = company?.builder_id || null;
  }

  if (!builderId) {
    throw httpError(400, "This enquiry has no target builder — pass builderId to say who it goes to.");
  }

  const releasedAt = new Date();
  const owner = await resolveTenantOwner(builderId, companyId);
  const toEmail = await resolveBuilderEmail(builderId, owner, body.released_to_email);

  const [, claimed] = await sequelize.query(
    `UPDATE landing_lead
        SET status = 'released',
            released_at = :releasedAt,
            released_by = :releasedBy,
            builder_id = :builderId,
            company_id = :companyId,
            released_to_email = :toEmail,
            release_amount = :amount,
            release_currency = :currency,
            release_method = :method,
            admin_notes = COALESCE(:adminNotes, admin_notes),
            updated_at = :releasedAt
      WHERE landing_lead_id = :id
        AND status = 'new'`,
    {
      replacements: {
        id,
        releasedAt,
        releasedBy: admin?.platform_user_id || null,
        builderId,
        companyId,
        toEmail: toEmail || null,
        amount: body.release_amount ?? null,
        currency: body.release_currency || "AUD",
        method: body.release_method || "email",
        adminNotes: body.admin_notes || null,
      },
    },
  );

  if (!claimed?.rowCount) {
    throw httpError(409, "This enquiry has already been released to a builder.");
  }

  // The landing form leaves phone optional, but a builder's Sales settings may
  // demand it (`lead_mandatory_option`), which would make such an enquiry
  // permanently unsellable. The admin can supply what is missing at release
  // time; it is written back so the enquiry itself stops being incomplete.
  const leadEmail = body.lead_email || row.email;
  const leadPhone = body.lead_phone || row.phone;

  if (body.lead_email || body.lead_phone) {
    await LandingLead.update(
      { email: leadEmail, phone: leadPhone },
      { where: { landing_lead_id: id } },
    );
  }

  let created;
  try {
    created = await leadsService.createPublicLead(
      {
        name: row.name,
        email: leadEmail,
        phone: leadPhone,
        notes: row.notes,
      },
      builderId,
      companyId,
      row.featur_facade_id,
      owner?.users_id || null,
    );
  } catch (error) {
    await LandingLead.update(
      {
        status: "new",
        released_at: null,
        released_by: null,
        released_to_email: null,
        release_amount: null,
        release_method: null,
      },
      { where: { landing_lead_id: id } },
    );
    throw httpError(500, `Could not create the lead in the builder's CRM: ${error.message}`);
  }

  // A duplicate email inside that builder is not a failure: the builder already
  // has the person, so the release still stands and points at the existing lead.
  const leadsId = created?.success
    ? created.data?.leadsId
    : created?.existingLead?.leadsId || null;

  if (!leadsId) {
    await LandingLead.update(
      {
        status: "new",
        released_at: null,
        released_by: null,
        released_to_email: null,
        release_amount: null,
        release_method: null,
      },
      { where: { landing_lead_id: id } },
    );
    // Most often this is the builder's own Sales settings talking — e.g.
    // `lead_mandatory_option = email_and_phone` against an enquiry that left the
    // phone blank. Say whose rule it is, or the admin reads it as our bug.
    throw httpError(
      400,
      created?.message
        ? `The builder's CRM rejected this lead: ${created.message}`
        : "Could not create the lead in the builder's CRM.",
    );
  }

  await LandingLead.update({ released_leads_id: leadsId }, { where: { landing_lead_id: id } });

  let emailSentAt = null;
  if (toEmail && body.send_email !== false) {
    try {
      const target = await targetResolver([{ builder_id: builderId, company_id: companyId }]);
      const message = buildReleaseEmail({
        lead: row,
        builderName: target({ builder_id: builderId, company_id: companyId })?.name,
        facadeName: row.facade_name,
        referenceNumber: created?.data?.referenceNumber || null,
      });
      await sendEmail(toEmail, message.subject, message.text, message.html);
      emailSentAt = new Date();
      await LandingLead.update({ email_sent_at: emailSentAt }, { where: { landing_lead_id: id } });
    } catch (error) {
      // The builder has the lead either way; a queue outage must not undo that.
      console.error("Release email could not be queued:", error.message);
    }
  }

  const fresh = await LandingLead.findByPk(id, { raw: true });
  const [shaped] = await shapeLandingLeads([fresh]);

  return {
    ...shaped,
    emailQueued: Boolean(emailSentAt),
    duplicateOfExistingLead: !created?.success,
  };
};

/** Spam, a test submission, or a duplicate — parked without touching any tenant. */
export const rejectLandingLeadService = async ({ id, body }) => {
  const { LandingLead } = db;

  const row = await LandingLead.findByPk(id, { raw: true });
  if (!row) throw httpError(404, "Landing lead not found.");
  if (row.kind !== LANDING_LEAD_KIND) throw httpError(404, "Landing lead not found.");
  if (row.status === "released") throw httpError(409, "A released enquiry cannot be rejected.");

  await LandingLead.update(
    { status: "rejected", rejected_at: new Date(), admin_notes: body.admin_notes || row.admin_notes },
    { where: { landing_lead_id: id } },
  );

  const [shaped] = await shapeLandingLeads([await LandingLead.findByPk(id, { raw: true })]);
  return shaped;
};

export const reopenLandingLeadService = async ({ id }) => {
  const { LandingLead } = db;

  const row = await LandingLead.findByPk(id, { raw: true });
  if (!row) throw httpError(404, "Landing lead not found.");
  if (row.kind !== LANDING_LEAD_KIND) throw httpError(404, "Landing lead not found.");
  if (row.status !== "rejected") throw httpError(409, "Only a rejected enquiry can be re-opened.");

  await LandingLead.update({ status: "new", rejected_at: null }, { where: { landing_lead_id: id } });

  const [shaped] = await shapeLandingLeads([await LandingLead.findByPk(id, { raw: true })]);
  return shaped;
};

export default {
  listLandingLeadsService,
  getLandingLeadStatsService,
  releaseLandingLeadService,
  rejectLandingLeadService,
  reopenLandingLeadService,
};
