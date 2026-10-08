import { Op, QueryTypes } from "sequelize";

import db from "../../../config/database/models/postgre-models/index.js";
import {
  parsePagination,
  withCamelAliases,
  listEnvelope,
  httpError,
  monthBuckets,
  rowTimestamp,
} from "../admin.helper.js";

/**
 * Demo requests, admin side.
 *
 * The landing site's "Book a Demo" button captures who they are, how to reach
 * them and what kind of business they run. That is the whole feature: this
 * screen is a call list. Nothing here provisions a tenant or writes into a
 * builder's CRM, which is why there is no release and no extra permission for
 * "writes outside the console" — the only mutations are the row's own status.
 *
 * Rows live on `landing_lead` with `kind = 'demo_request'` for the same reason
 * sign-up requests do: the table already carries the lifecycle, and `kind`
 * keeps the three populations from counting each other.
 */

const DEMO_KIND = "demo_request";

/**
 * Both non-`new` stages are reversible — `reopen` puts either back in the
 * queue. Marking somebody contacted by mistake and losing the request would be
 * worse than the double-handling.
 */
export const DEMO_STAGES = ["new", "contacted", "rejected"];

export const DEMO_SORT_COLUMNS = withCamelAliases({
  name: "name",
  email: "email",
  company_name: "company_name",
  company_type: "company_type",
  created_at: "created_at",
  contacted_at: "contacted_at",
  status: "status",
});

const buildWhere = (query) => {
  const where = { kind: DEMO_KIND };
  const and = [];

  if (query.stage) {
    if (!DEMO_STAGES.includes(query.stage)) {
      throw httpError(400, `stage must be one of ${DEMO_STAGES.join(", ")}.`);
    }
    where.status = query.stage;
  }

  if (query.source) where.source = query.source;
  if (query.company_type) where.company_type = query.company_type;

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
        { company_name: { [Op.iLike]: term } },
      ],
    });
  }

  if (and.length) where[Op.and] = and;
  return where;
};

/**
 * Who marked it contacted. Read live off `platform_user` rather than
 * snapshotted onto the row, the same way the other admin screens resolve the
 * things they point at.
 */
const handlerResolver = async (rows) => {
  const { PlatformUser } = db;
  const ids = [...new Set(rows.map((r) => r.released_by).filter(Boolean))];
  if (!ids.length) return () => null;

  const admins = await PlatformUser.findAll({
    attributes: ["platform_user_id", "name", "email"],
    where: { platform_user_id: { [Op.in]: ids } },
    raw: true,
  });

  const byId = new Map(admins.map((a) => [a.platform_user_id, a]));

  return (row) => {
    const admin = byId.get(row.released_by);
    if (!admin) return null;
    return { platformUserId: admin.platform_user_id, name: admin.name, email: admin.email };
  };
};

async function shapeDemoRequests(rows) {
  const handlerOf = await handlerResolver(rows);

  return rows.map((row) => ({
    landingLeadId: row.landing_lead_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company_name,
    companyType: row.company_type,
    message: row.notes,
    source: row.source,
    pageUrl: row.page_url,
    utm: {
      source: row.utm_source || null,
      medium: row.utm_medium || null,
      campaign: row.utm_campaign || null,
    },
    // `status` and `stage` are the same value for this kind — nothing about a
    // demo request is derived from another table. Both are returned so the
    // console can share the filter/badge shape it uses on the other screens.
    status: row.status,
    stage: row.status,
    contactedAt: rowTimestamp(row, "contacted_at"),
    contactedBy: handlerOf(row),
    rejectedAt: rowTimestamp(row, "rejected_at"),
    adminNotes: row.admin_notes,
    createdAt: rowTimestamp(row, "created_at"),
  }));
}

export const listDemoRequestsService = async ({ query }) => {
  const { LandingLead } = db;
  const { page, limit, offset } = parsePagination(query);

  const sortColumn = DEMO_SORT_COLUMNS[query.sort_by] || "created_at";
  const sortDirection = String(query.sort_dir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const { count, rows } = await LandingLead.findAndCountAll({
    where: buildWhere(query),
    order: [[sortColumn, sortDirection]],
    limit,
    offset,
    raw: true,
  });

  return listEnvelope(await shapeDemoRequests(rows), count, page, limit);
};

export const getDemoRequestStatsService = async () => {
  const { LandingLead, sequelize } = db;

  const scope = { kind: DEMO_KIND };

  const [total, fresh, contacted, rejected, bySourceRows, byTypeRows] = await Promise.all([
    LandingLead.count({ where: scope }),
    LandingLead.count({ where: { ...scope, status: "new" } }),
    LandingLead.count({ where: { ...scope, status: "contacted" } }),
    LandingLead.count({ where: { ...scope, status: "rejected" } }),
    LandingLead.findAll({
      attributes: ["source", [sequelize.fn("COUNT", sequelize.col("landing_lead_id")), "count"]],
      where: scope,
      group: ["source"],
      raw: true,
    }),
    LandingLead.findAll({
      attributes: ["company_type", [sequelize.fn("COUNT", sequelize.col("landing_lead_id")), "count"]],
      where: scope,
      group: ["company_type"],
      raw: true,
    }),
  ]);

  const buckets = monthBuckets(12);

  const trend = await sequelize.query(
    `SELECT to_char(date_trunc('month', ll.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS period,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ll.status = 'contacted')::int AS contacted,
            COUNT(*) FILTER (WHERE ll.status = 'rejected')::int AS rejected
       FROM landing_lead ll
      WHERE ll.kind = :kind
        AND ll.created_at >= :from
      GROUP BY 1
      ORDER BY 1`,
    { replacements: { kind: DEMO_KIND, from: buckets[0].start }, type: QueryTypes.SELECT },
  );

  const trendMap = new Map(trend.map((t) => [t.period, t]));

  return {
    totals: {
      total,
      new: fresh,
      contacted,
      rejected,
      // Of everything already dealt with, how much was worth a call. Requests
      // still waiting are not a rejection and must not drag this down.
      contactRate: contacted + rejected
        ? Number(((contacted / (contacted + rejected)) * 100).toFixed(1))
        : 0,
    },
    trend: buckets.map((b) => ({
      period: b.period,
      total: trendMap.get(b.period)?.total || 0,
      contacted: trendMap.get(b.period)?.contacted || 0,
      rejected: trendMap.get(b.period)?.rejected || 0,
    })),
    bySource: bySourceRows.map((r) => ({ source: r.source || "unknown", count: Number(r.count) })),
    byCompanyType: byTypeRows.map((r) => ({
      companyType: r.company_type || "Not given",
      count: Number(r.count),
    })),
  };
};

const loadDemoRequest = async (id) => {
  const { LandingLead } = db;
  const row = await LandingLead.findByPk(id, { raw: true });
  if (!row || row.kind !== DEMO_KIND) throw httpError(404, "Demo request not found.");
  return row;
};

const reshape = async (id) => {
  const { LandingLead } = db;
  const [shaped] = await shapeDemoRequests([await LandingLead.findByPk(id, { raw: true })]);
  return shaped;
};

/**
 * Mark a request worked: somebody has rung them and the demo is arranged.
 *
 * `released_by` carries the admin because that column already means "the admin
 * who acted on this row" for the other two kinds, and a second person column
 * on a shared table for one kind would be dead weight on the other two.
 */
export const markDemoRequestContactedService = async ({ id, body, admin }) => {
  const { LandingLead } = db;

  const row = await loadDemoRequest(id);
  if (row.status === "contacted") throw httpError(409, "This request is already marked contacted.");

  await LandingLead.update(
    {
      status: "contacted",
      contacted_at: new Date(),
      released_by: admin?.platform_user_id || null,
      rejected_at: null,
      admin_notes: body.admin_notes || row.admin_notes,
    },
    { where: { landing_lead_id: id } },
  );

  return reshape(id);
};

/** Spam, a competitor, a student — parked without anybody having to ring them. */
export const rejectDemoRequestService = async ({ id, body }) => {
  const { LandingLead } = db;

  const row = await loadDemoRequest(id);
  if (row.status === "rejected") throw httpError(409, "This request has already been dismissed.");

  await LandingLead.update(
    {
      status: "rejected",
      rejected_at: new Date(),
      admin_notes: body.admin_notes || row.admin_notes,
    },
    { where: { landing_lead_id: id } },
  );

  return reshape(id);
};

export const reopenDemoRequestService = async ({ id }) => {
  const { LandingLead } = db;

  const row = await loadDemoRequest(id);
  if (row.status === "new") throw httpError(409, "This request is already in the queue.");

  await LandingLead.update(
    { status: "new", contacted_at: null, rejected_at: null },
    { where: { landing_lead_id: id } },
  );

  return reshape(id);
};

export default {
  listDemoRequestsService,
  getDemoRequestStatsService,
  markDemoRequestContactedService,
  rejectDemoRequestService,
  reopenDemoRequestService,
};
