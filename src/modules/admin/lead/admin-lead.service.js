import { Op, QueryTypes } from "sequelize";

import db from "../../../config/database/models/postgre-models/index.js";
import { parsePagination, withCamelAliases, listEnvelope, httpError, resolveCompanies, monthBuckets, rowTimestamp } from "../admin.helper.js";

/**
 * `open` splits in two, which is what the Won/Lost tiles count:
 *   new     — nobody has quoted this lead yet.
 *   pending — a quotation exists but it has neither won nor lost.
 * `open` is kept as the union of the two so existing callers keep working.
 */
export const LEAD_OUTCOMES = ["open", "new", "pending", "won", "lost"];

/**
 * Two populations live in `leads`:
 *
 * - `product` — someone interested in buying inBuildify itself. They are not a
 *   tenant yet, so the row carries neither `company_id` nor `builder_id`.
 * - `all` — every CRM lead on the platform, i.e. each builder's own customers.
 *
 * A landing-page facade enquiry is NOT product interest: `createPublicLead`
 * requires a `builder_id`, so that lead belongs to the builder whose facade was
 * clicked. The only company-less lead is one raised against the platform.
 */
export const LEAD_SCOPES = ["product", "all"];

const PRODUCT_SCOPE = { company_id: null, builder_id: null };

const PRODUCT_SCOPE_SQL = "l.company_id IS NULL AND l.builder_id IS NULL";

const scopeWhere = (scope) => {
  if (scope && !LEAD_SCOPES.includes(scope)) {
    throw httpError(400, `scope must be one of ${LEAD_SCOPES.join(", ")}.`);
  }
  return scope === "product" ? { ...PRODUCT_SCOPE } : {};
};

/**
 * Won/lost lives on the opportunity the Convert step creates
 * (`opportunity.out_come`), not on `leads.status` — every converted lead sits at
 * status "Convert" whether it later closed won or lost. `lead_lost_reason_id` is
 * kept as a second lost signal; in the data the two agree.
 */
const LEAD_ID = "\"Leads\".\"leads_id\"";
const LOST_REASON = "\"Leads\".\"lead_lost_reason_id\"";

/**
 * Won/lost/quoted as SQL against an arbitrary lead-id expression, so the landing
 * marketplace can read the outcome of a released lead
 * (`landing_lead.released_leads_id`) through the very same definition the
 * Won/Lost screen uses. A second definition would drift.
 *
 * `lostFor` takes the lost-reason column separately because it only exists when
 * the `leads` row itself is in the query; a subquery form falls back to reading
 * it off `leads` by id.
 */
export const wonFor = (leadIdSql) =>
  `EXISTS (SELECT 1 FROM opportunity o WHERE o.leads_id = ${leadIdSql} AND o.out_come = 'won')`;

export const lostFor = (leadIdSql, lostReasonSql) =>
  `(${lostReasonSql || `(SELECT lx.lead_lost_reason_id FROM leads lx WHERE lx.leads_id = ${leadIdSql})`} IS NOT NULL`
  + ` OR EXISTS (SELECT 1 FROM opportunity o WHERE o.leads_id = ${leadIdSql} AND o.out_come = 'lost'))`;

/** A quotation exists for the lead — the signal that turns "new" into "pending". */
export const quotedFor = (leadIdSql) =>
  `EXISTS (SELECT 1 FROM quotation q WHERE q.leads_id = ${leadIdSql})`;

const WON_SQL = wonFor(LEAD_ID);
const LOST_SQL = lostFor(LEAD_ID, LOST_REASON);
const QUOTED_SQL = quotedFor(LEAD_ID);

export const LEAD_SORT_COLUMNS = withCamelAliases({
  name: "name",
  created_at: "created_at",
  status: "status",
  build_budget: "build_budget",
});

const outcomeWhere = (outcome, sequelize) => {
  if (outcome === "won") return sequelize.literal(`${WON_SQL} AND NOT ${LOST_SQL}`);
  if (outcome === "lost") return sequelize.literal(LOST_SQL);
  if (outcome === "open") return sequelize.literal(`NOT ${WON_SQL} AND NOT ${LOST_SQL}`);
  // Both carry the same NOT-won/NOT-lost guard as `open`: without it a won lead
  // that has a quotation would be counted twice and `new` would go negative.
  if (outcome === "pending") return sequelize.literal(`NOT ${WON_SQL} AND NOT ${LOST_SQL} AND ${QUOTED_SQL}`);
  if (outcome === "new") return sequelize.literal(`NOT ${WON_SQL} AND NOT ${LOST_SQL} AND NOT ${QUOTED_SQL}`);
  return null;
};

const outcomeOf = (lead, wonIds, lostIds, quotedIds) => {
  if (lostIds.has(lead.leads_id)) return "lost";
  if (wonIds.has(lead.leads_id)) return "won";
  return quotedIds?.has(lead.leads_id) ? "pending" : "new";
};

const buildLeadWhere = (query, sequelize) => {
  const { search, outcome, status, company_id, lead_source_id, rating, from, to, scope } = query;
  const where = scopeWhere(scope);
  const and = [];

  if (outcome) {
    if (!LEAD_OUTCOMES.includes(outcome)) {
      throw httpError(400, `outcome must be one of ${LEAD_OUTCOMES.join(", ")}.`);
    }
    and.push(outcomeWhere(outcome, sequelize));
  }

  if (status) where.status = status;
  if (company_id) {
    if (scope === "product") {
      throw httpError(400, "companyId cannot be combined with scope=product — product leads have no company.");
    }
    where.company_id = company_id;
  }
  if (lead_source_id) where.lead_source_id = lead_source_id;
  if (rating) where.rating = rating;

  if (from || to) {
    where.created_at = {};
    if (from) where.created_at[Op.gte] = new Date(from);
    if (to) where.created_at[Op.lte] = new Date(to);
  }

  if (search) {
    const term = `%${String(search).trim()}%`;
    and.push({
      [Op.or]: [
        { name: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } },
        { phone: { [Op.iLike]: term } },
        { reference_number: { [Op.iLike]: term } },
      ],
    });
  }

  if (and.length) where[Op.and] = and;
  return where;
};

async function shapeLeads(rows) {
  const { FeaturedFacadeLead, Opportunity, Quotation, LandingLead } = db;
  const ids = rows.map((r) => r.leads_id);

  const [companyOf, landingFacadeLeads, releasedLandingLeads, opportunities, quotations] = await Promise.all([
    resolveCompanies(db, rows),
    ids.length
      ? FeaturedFacadeLead.findAll({ where: { leads_id: { [Op.in]: ids } }, attributes: ["leads_id"], raw: true })
      : [],
    // A lead released from the landing marketplace is a landing lead too, even
    // when the facade link could not be written.
    ids.length
      ? LandingLead.findAll({ where: { released_leads_id: { [Op.in]: ids } }, attributes: ["released_leads_id"], raw: true })
      : [],
    ids.length
      ? Opportunity.findAll({ where: { leads_id: { [Op.in]: ids } }, order: [["created_at", "DESC"]], raw: true })
      : [],
    ids.length
      ? Quotation.findAll({ where: { leads_id: { [Op.in]: ids } }, attributes: ["leads_id"], raw: true })
      : [],
  ]);

  const fromLanding = new Set([
    ...landingFacadeLeads.map((l) => l.leads_id),
    ...releasedLandingLeads.map((l) => l.released_leads_id),
  ]);
  const quotedIds = new Set(quotations.map((q) => q.leads_id));

  const wonIds = new Set(opportunities.filter((o) => o.out_come === "won").map((o) => o.leads_id));
  const lostIds = new Set([
    ...opportunities.filter((o) => o.out_come === "lost").map((o) => o.leads_id),
    ...rows.filter((r) => r.lead_lost_reason_id).map((r) => r.leads_id),
  ]);

  const oppMap = new Map();
  for (const o of opportunities) {
    if (!oppMap.has(o.leads_id)) oppMap.set(o.leads_id, o);
  }

  return rows.map((row) => {
    const opportunity = oppMap.get(row.leads_id);

    return {
      leadsId: row.leads_id,
      referenceNumber: row.reference_number,
      name: row.name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      outcome: outcomeOf(row, wonIds, lostIds, quotedIds),
      quoted: quotedIds.has(row.leads_id),
      rating: row.rating,
      buildBudget: row.build_budget,
      land: row.land,
      finance: row.finance,
      purpose: row.purpose,
      createdAt: rowTimestamp(row, "created_at"),
      fromLandingPage: fromLanding.has(row.leads_id),
      company: companyOf(row),
      source: row["leadSource.lead_source_id"]
        ? { leadSourceId: row["leadSource.lead_source_id"], name: row["leadSource.name"] }
        : null,
      lostReason: row["leadLostReason.lead_lost_reason_id"]
        ? { leadLostReasonId: row["leadLostReason.lead_lost_reason_id"], reason: row["leadLostReason.lost_reason"] }
        : null,
      lostComment: row.lead_lost_comment,
      opportunity: opportunity
        ? {
          opportunityId: opportunity.opportunity_id,
          status: opportunity.status,
          outcome: opportunity.out_come,
          createdAt: rowTimestamp(opportunity, "created_at"),
        }
        : null,
    };
  });
}

const leadIncludes = () => {
  const { LeadSource, LeadLostReason } = db;
  return [
    { model: LeadSource, as: "leadSource", attributes: ["lead_source_id", "name"], required: false },
    { model: LeadLostReason, as: "leadLostReason", attributes: ["lead_lost_reason_id", "lost_reason"], required: false },
  ];
};

export const listLeadsService = async ({ query }) => {
  const { Leads, sequelize } = db;
  const { page, limit, offset } = parsePagination(query);

  const sortColumn = LEAD_SORT_COLUMNS[query.sort_by] || "created_at";
  const sortDirection = String(query.sort_dir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const { count, rows } = await Leads.findAndCountAll({
    where: buildLeadWhere(query, sequelize),
    include: leadIncludes(),
    order: [[sortColumn, sortDirection]],
    limit,
    offset,
    raw: true,
    distinct: true,
  });

  return listEnvelope(await shapeLeads(rows), count, page, limit);
};

/**
 * A lead reached the CRM from the landing site either through the old direct
 * capture (`featured_facade_lead`) or by being released from the marketplace
 * (`landing_lead.released_leads_id`). Counting one table would undercount.
 */
const FROM_LANDING_SQL = `(EXISTS (SELECT 1 FROM featured_facade_lead ffl WHERE ffl.leads_id = ${LEAD_ID})`
  + ` OR EXISTS (SELECT 1 FROM landing_lead ll WHERE ll.released_leads_id = ${LEAD_ID}))`;

export const getLeadStatsService = async ({ query }) => {
  const { Leads, LeadSource, sequelize } = db;

  // Every number on this payload has to answer for the same population as the
  // table beside it, or the tiles read 28 while the rows read 0.
  const isProduct = query.scope === "product";
  let scope = {};
  if (isProduct) scope = scopeWhere("product");
  else if (query.company_id) scope = { company_id: query.company_id };

  const [total, won, lost, pending, fresh, landingCount, ratings, sources] = await Promise.all([
    Leads.count({ where: scope }),
    Leads.count({ where: { ...scope, [Op.and]: [outcomeWhere("won", sequelize)] } }),
    Leads.count({ where: { ...scope, [Op.and]: [outcomeWhere("lost", sequelize)] } }),
    Leads.count({ where: { ...scope, [Op.and]: [outcomeWhere("pending", sequelize)] } }),
    Leads.count({ where: { ...scope, [Op.and]: [outcomeWhere("new", sequelize)] } }),
    // Old: FeaturedFacadeLead.count(...) — missed marketplace releases whose
    // facade link could not be written, and counted link rows, not leads.
    isProduct
      ? 0
      : Leads.count({ where: { ...scope, [Op.and]: [sequelize.literal(FROM_LANDING_SQL)] } }),
    Leads.findAll({
      attributes: ["rating", [sequelize.fn("COUNT", sequelize.col("leads_id")), "count"]],
      where: scope,
      group: ["rating"],
      raw: true,
    }),
    Leads.findAll({
      attributes: ["lead_source_id", [sequelize.fn("COUNT", sequelize.col("Leads.leads_id")), "count"]],
      where: scope,
      include: [{ model: LeadSource, as: "leadSource", attributes: ["name"], required: false }],
      group: ["Leads.lead_source_id", "leadSource.lead_source_id"],
      raw: true,
    }),
  ]);

  const buckets = monthBuckets(12);
  let trendScopeSql = "";
  if (isProduct) trendScopeSql = `AND ${PRODUCT_SCOPE_SQL}`;
  else if (query.company_id) trendScopeSql = "AND l.company_id = :companyId";

  const trend = await sequelize.query(
    `SELECT to_char(date_trunc('month', l.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS period,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE o.out_come = 'won')::int AS won,
            COUNT(*) FILTER (WHERE o.out_come = 'lost' OR l.lead_lost_reason_id IS NOT NULL)::int AS lost
       FROM leads l
       LEFT JOIN LATERAL (
         SELECT out_come FROM opportunity WHERE leads_id = l.leads_id ORDER BY created_at DESC LIMIT 1
       ) o ON true
      WHERE l.created_at >= :from
        ${trendScopeSql}
      GROUP BY 1
      ORDER BY 1`,
    {
      replacements: { from: buckets[0].start, companyId: query.company_id || null },
      type: QueryTypes.SELECT,
    },
  );

  const trendMap = new Map(trend.map((t) => [t.period, t]));

  return {
    scope: isProduct ? "product" : "all",
    totals: {
      total,
      won,
      lost,
      // new + pending === open, by construction of the two guards above.
      new: fresh,
      pending,
      open: total - won - lost,
      fromLandingPage: landingCount,
      conversionRate: total ? Number(((won / total) * 100).toFixed(1)) : 0,
    },
    trend: buckets.map((b) => ({
      period: b.period,
      total: trendMap.get(b.period)?.total || 0,
      won: trendMap.get(b.period)?.won || 0,
      lost: trendMap.get(b.period)?.lost || 0,
    })),
    byRating: ratings.map((r) => ({ rating: r.rating || "Unrated", count: Number(r.count) })),
    bySource: sources.map((s) => ({
      leadSourceId: s.lead_source_id,
      name: s["leadSource.name"] || "Unknown",
      count: Number(s.count),
    })),
  };
};

export const listClientsService = async ({ query }) => {
  const { Leads, ClientType, sequelize } = db;
  const { page, limit, offset } = parsePagination(query);

  const { count, rows } = await Leads.findAndCountAll({
    where: buildLeadWhere({ ...query, outcome: "won" }, sequelize),
    include: [
      ...leadIncludes(),
      { model: ClientType, as: "clientType", attributes: ["client_type_id", "client_type"], required: false },
    ],
    order: [[
      LEAD_SORT_COLUMNS[query.sort_by] || "created_at",
      String(query.sort_dir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC",
    ]],
    limit,
    offset,
    raw: true,
    distinct: true,
  });

  const shaped = await shapeLeads(rows);

  const items = shaped.map((lead, index) => ({
    ...lead,
    clientType: rows[index]["clientType.client_type_id"]
      ? { clientTypeId: rows[index]["clientType.client_type_id"], name: rows[index]["clientType.client_type"] }
      : null,
    convertedAt: lead.opportunity?.createdAt || null,
  }));

  return listEnvelope(items, count, page, limit);
};

export default {
  listLeadsService,
  getLeadStatsService,
  listClientsService,
};
