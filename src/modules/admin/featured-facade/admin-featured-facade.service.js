import { Op, QueryTypes } from "sequelize";

import db from "../../../config/database/models/postgre-models/index.js";
import { FEATUR_FACADE_APPROVAL } from "../../../config/database/models/postgre-models/featur_facade.model.js";
import {
  FEATUR_FACADE_CACHE_PREFIX,
  nextDisplayOrder,
} from "../../featur-facade/featur-facade.service.js";
import {
  LANDING_MIN_SLOTS,
  LANDING_MAX_SLOTS,
  rankFillerFacades,
} from "../../featur-facade/landing-fill.service.js";
import {
  orderLandingPromotions,
  landingTieKey,
  rotationIntervalHours,
} from "../../featur-facade/landing-rotation.js";
import { deleteCacheByPrefix } from "../../../service/redisCache.service.js";
import { isUuid, s3UrlForKey } from "../../../helper/imageDriveFile.helper.js";
import {
  parsePagination,
  withCamelAliases,
  listEnvelope,
  httpError,
  resolveCompanies,
} from "../admin.helper.js";

/**
 * Featured-facade requests, admin side.
 *
 * A builder pressing "Feature this facade" in the CRM is asking to appear on
 * inBuildify's own landing page — not their site, ours — so the row lands here
 * as a request and shows nowhere until somebody on the platform team approves
 * it. Approving does not publish on its own either: the builder's own window
 * (`start_date`/`end_date`) and their active toggle still gate it, which is why
 * every row on this screen carries both a review state and a window state.
 *
 * Orphans are joined out rather than filtered out. `facade_id` is ON DELETE SET
 * NULL, so a facade removed after its promotion leaves a row pointing at
 * nothing; the public feed drops those on the same inner join, and a queue
 * offering an admin a facade that no longer exists would be worse than useless.
 */

export const APPROVAL_STATUSES = [
  FEATUR_FACADE_APPROVAL.PENDING,
  FEATUR_FACADE_APPROVAL.APPROVED,
  FEATUR_FACADE_APPROVAL.REJECTED,
];

export const FEATURED_FACADE_SORT_COLUMNS = withCamelAliases({
  created_at: "ff.created_at",
  start_date: "ff.start_date",
  end_date: "ff.end_date",
  facade_name: "f.name",
  approval_status: "ff.approval_status",
  reviewed_at: "ff.reviewed_at",
  leads: "lead_count",
  display_order: "ff.display_order",
});

/** Whatever the review says, is this on the site right now? */
const isLiveNow = (row, now = new Date()) =>
  row.approval_status === FEATUR_FACADE_APPROVAL.APPROVED &&
  row.is_active === true &&
  (!row.start_date || new Date(row.start_date) <= now) &&
  (!row.end_date || new Date(row.end_date) >= now);

/**
 * How the builder's own window reads, independent of the review. Mirrors the
 * landing feed's date filter so this screen and the public site can never
 * disagree about what "live" means.
 */
const windowStateOf = (row, now = new Date()) => {
  if (row.is_active === false) return "inactive";
  if (row.end_date && new Date(row.end_date) < now) return "expired";
  if (row.start_date && new Date(row.start_date) > now) return "scheduled";
  return "current";
};

const buildFilters = (query) => {
  const filters = [
    "ff.is_delete = false",
    "ff.facade_id IS NOT NULL",
  ];
  const replacements = {};

  // Not a client-facing filter — it is how a write reads its own row back
  // through the same query the list uses, so both answer in one shape.
  if (query.featur_facade_id) {
    filters.push("ff.featur_facade_id = :featurFacadeId");
    replacements.featurFacadeId = query.featur_facade_id;
  }

  if (query.status) {
    if (!APPROVAL_STATUSES.includes(query.status)) {
      throw httpError(400, `status must be one of ${APPROVAL_STATUSES.join(", ")}.`);
    }
    filters.push("ff.approval_status = :status");
    replacements.status = query.status;
  }

  // What a visitor would see right now — the same three conditions the public
  // feed applies on top of the approval. Used by the ordering strip, where a
  // promotion nobody can see has no meaningful position.
  if (query.live_only) {
    filters.push(`ff.approval_status = 'approved'
      AND ff.is_active = true
      AND (ff.start_date IS NULL OR ff.start_date <= NOW())
      AND (ff.end_date   IS NULL OR ff.end_date   >= NOW())`);
  }

  if (query.company_id) {
    filters.push("(ff.company_id = :companyId OR ff.builder_id = :companyId)");
    replacements.companyId = query.company_id;
  }

  if (query.search) {
    filters.push("f.name ILIKE :search");
    replacements.search = `%${String(query.search).trim()}%`;
  }

  if (query.from) {
    filters.push("ff.created_at >= :from");
    replacements.from = new Date(query.from);
  }
  if (query.to) {
    filters.push("ff.created_at <= :to");
    replacements.to = new Date(query.to);
  }

  return { where: `WHERE ${filters.join(" AND ")}`, replacements };
};

/** Who reviewed it. Read live off `platform_user`, not snapshotted onto the row. */
const reviewerResolver = async (rows) => {
  const { PlatformUser } = db;
  const ids = [...new Set(rows.map((row) => row.reviewed_by).filter(Boolean))];
  if (!ids.length) return () => null;

  const admins = await PlatformUser.findAll({
    attributes: ["platform_user_id", "name", "email"],
    where: { platform_user_id: { [Op.in]: ids } },
    raw: true,
  });

  const byId = new Map(admins.map((admin) => [admin.platform_user_id, admin]));

  return (row) => {
    const admin = byId.get(row.reviewed_by);
    if (!admin) return null;
    return { platformUserId: admin.platform_user_id, name: admin.name, email: admin.email };
  };
};

/**
 * `facade.image` holds a DriveFile UUID, not a URL. The model's afterFind hook
 * resolves that on ordinary reads but this list is raw SQL, so it does the same
 * lookup once for the page.
 */
const imageResolver = async (rows) => {
  const ids = rows.map((row) => row.facade_image).filter(isUuid);
  if (!ids.length) return () => null;

  const files = await db.DriveFile.findAll({
    where: { file_id: ids },
    attributes: ["file_id", "s3_key"],
    raw: true,
  });

  const byId = new Map(files.map((file) => [file.file_id, s3UrlForKey(file.s3_key)]));
  return (row) => (isUuid(row.facade_image) ? byId.get(row.facade_image) ?? null : row.facade_image);
};

const shapeRequests = async (rows) => {
  const now = new Date();
  const [companyOf, reviewerOf, imageOf] = await Promise.all([
    resolveCompanies(db, rows),
    reviewerResolver(rows),
    imageResolver(rows),
  ]);

  return rows.map((row) => ({
    featurFacadeId: row.featur_facade_id,
    facadeId: row.facade_id,
    facade: {
      name: row.facade_name,
      image: imageOf(row),
      dwellingType: row.dwelling_type_name || null,
      // The builder can deactivate the facade itself in their catalog without
      // touching the promotion — worth seeing before approving one.
      active: row.facade_status,
    },
    company: companyOf(row),
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    displayOrder: row.display_order,
    approvalStatus: row.approval_status,
    windowState: windowStateOf(row, now),
    liveNow: isLiveNow(row, now),
    leadCount: row.lead_count,
    reviewedAt: row.reviewed_at,
    reviewedBy: reviewerOf(row),
    reviewNote: row.review_note,
    requestedAt: row.created_at,
    // How much the facade behind the promotion is actually built on. A filled
    // slot has carried this since it existed — it is the whole reason that
    // facade is on the page — and a real promotion needs it for the opposite
    // reason: nothing about being approved says whether anybody uses the thing,
    // so this is the one number on the row that is not about the request.
    //
    // Absent rather than zeroed when the query did not ask for it, so a caller
    // reading `usage.total` on a row that never had one gets a crash in
    // development rather than a plausible 0 on the screen.
    usage: row.total_uses === undefined ? undefined : {
      total: row.total_uses,
      quotations: row.quotation_uses,
      houseLandPackages: row.house_land_package_uses,
      lotPackages: row.lot_package_uses,
    },
  }));
};

export const listFeaturedFacadeRequestsService = async ({ query }) => {
  const { sequelize } = db;
  const { page, limit, offset } = parsePagination(query);
  const { where, replacements } = buildFilters(query);

  const sortColumn = FEATURED_FACADE_SORT_COLUMNS[query.sort_by] || "ff.created_at";
  const sortDirection = String(query.sort_dir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  // The usage counts are joined on the facade, not the promotion, so they say
  // the same thing here as on the Facades screen and on a filled slot: how much
  // this facade is actually built on. Promotions are not among them — being
  // featured is done *to* a facade, not a use of it — which is what lets the row
  // and the Facades screen show the same number.
  //
  // Taken as a parameter so the count query can leave them out: it needs none of
  // them, and three subquery joins to produce a number nobody reads is work.
  const fromClause = (usage) => `
      FROM featur_facade ff
      JOIN facade f ON f.facade_id = ff.facade_id
      LEFT JOIN dwelling_type dt ON dt.dwelling_type_id = f.dwelling_type_id
      LEFT JOIN (
        SELECT featur_facade_id, COUNT(*) cnt
          FROM featured_facade_lead
         GROUP BY 1
      ) l ON l.featur_facade_id = ff.featur_facade_id
      ${usage ? `
      LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM quotation_version  WHERE facade_id IS NOT NULL GROUP BY 1) qv  ON qv.facade_id  = ff.facade_id
      LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM house_land_package WHERE facade_id IS NOT NULL GROUP BY 1) hlp ON hlp.facade_id = ff.facade_id
      LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM lot_package        WHERE facade_id IS NOT NULL GROUP BY 1) lp  ON lp.facade_id  = ff.facade_id` : ""}
      ${where}`;

  const [rows, [{ count }]] = await Promise.all([
    sequelize.query(
      `SELECT ff.featur_facade_id, ff.facade_id, ff.builder_id, ff.company_id,
              ff.start_date, ff.end_date, ff.is_active, ff.approval_status,
              ff.reviewed_at, ff.reviewed_by, ff.review_note, ff.created_at,
              ff.display_order,
              f.name AS facade_name, f.image AS facade_image, f.status AS facade_status,
              dt.name AS dwelling_type_name,
              COALESCE(l.cnt, 0)::int AS lead_count,
              COALESCE(qv.cnt, 0)::int  AS quotation_uses,
              COALESCE(hlp.cnt, 0)::int AS house_land_package_uses,
              COALESCE(lp.cnt, 0)::int  AS lot_package_uses,
              (COALESCE(qv.cnt,0) + COALESCE(hlp.cnt,0) + COALESCE(lp.cnt,0))::int AS total_uses
         ${fromClause(true)}
        ORDER BY ${sortColumn} ${sortDirection}, ff.featur_facade_id
        LIMIT :limit OFFSET :offset`,
      { replacements: { ...replacements, limit, offset }, type: QueryTypes.SELECT },
    ),
    sequelize.query(`SELECT COUNT(*)::int AS count ${fromClause(false)}`, {
      replacements, type: QueryTypes.SELECT,
    }),
  ]);

  return listEnvelope(await shapeRequests(rows), count, page, limit);
};

/**
 * The counters above the queue.
 *
 * "Live" is deliberately not the same as "approved": an approved promotion
 * whose window has not opened yet, or whose builder switched it off, is not on
 * the site. The console says how many facades a visitor would actually see.
 */
export const getFeaturedFacadeStatsService = async () => {
  const { sequelize } = db;

  const [row] = await sequelize.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ff.approval_status = 'pending')::int  AS pending,
            COUNT(*) FILTER (WHERE ff.approval_status = 'approved')::int AS approved,
            COUNT(*) FILTER (WHERE ff.approval_status = 'rejected')::int AS rejected,
            COUNT(*) FILTER (
              WHERE ff.approval_status = 'approved'
                AND ff.is_active = true
                AND (ff.start_date IS NULL OR ff.start_date <= NOW())
                AND (ff.end_date   IS NULL OR ff.end_date   >= NOW())
            )::int AS live,
            COUNT(DISTINCT COALESCE(ff.company_id, ff.builder_id))::int AS builders
       FROM featur_facade ff
       JOIN facade f ON f.facade_id = ff.facade_id
      WHERE ff.is_delete = false`,
    { type: QueryTypes.SELECT },
  );

  return {
    totals: {
      total: row.total,
      pending: row.pending,
      approved: row.approved,
      rejected: row.rejected,
      live: row.live,
      builders: row.builders,
      // Of everything already reviewed. Requests still waiting are not a
      // rejection and must not drag this down.
      approvalRate: row.approved + row.rejected
        ? Number(((row.approved / (row.approved + row.rejected)) * 100).toFixed(1))
        : 0,
    },
  };
};

/**
 * How many facades the ordering strip will hand back at once.
 *
 * `parsePagination` caps a page at 100 anyway, and a carousel deep enough to
 * need a 101st hand-placed facade has a different problem. Past that the tail
 * keeps its numbers and stays behind everything above it.
 */
const ORDER_STRIP_LIMIT = 100;

/**
 * The landing carousel as it stands, in the order visitors see it.
 *
 * Only what is live. An approved promotion whose window has not opened, or one
 * the builder switched off, has a number but no position — putting it on this
 * strip would say it is third on a page it does not appear on. It slots into
 * its number on its own when it goes live.
 *
 * Below `LANDING_MIN_SLOTS` promotions the site fills the rest of the carousel
 * itself, so those places are handed back here too — see `landingFillerSlots`.
 * They are appended, never interleaved: this screen has to read as the front
 * page does, and on the front page nothing outranks a promotion.
 *
 * Above `LANDING_MAX_SLOTS` the site shows nothing, but this screen still does.
 * Truncating here would be the one change an admin cannot undo from this screen:
 * the way a held promotion gets onto the site is by being dragged above one that
 * is on it, and a row nobody can see is a row nobody can drag. So the overflow
 * stays, flagged — `onSite` is what separates the strip visitors get from the
 * queue behind it.
 */
export const getLandingOrderService = async () => {
  const strip = await listFeaturedFacadeRequestsService({
    query: {
      live_only: true,
      page: 1,
      limit: ORDER_STRIP_LIMIT,
      sort_by: "display_order",
      sort_dir: "asc",
    },
  });

  // Promotions sharing a number share the position, and the site rotates them
  // through the day — so this screen has to show them the way the site has them
  // right now, or it stops being a picture of the front page. Saving from a
  // rotated strip is not a trap: it writes the order an admin can see, which
  // ends the tie and, with it, the rotation.
  //
  // `onSite` is read off the rotated order for the same reason the feed cuts
  // its own ceiling after rotating: a tie straddling the twentieth place takes
  // turns across it, so which of them is on the site is a question about right
  // now, not about `display_order`.
  //
  // Ordered here rather than in the query the strip came from: that query also
  // serves the requests queue and takes whatever sort an admin picked, while
  // this screen has exactly one correct order — the site's. Which is why it runs
  // the feed's own function rather than a copy of its rule.
  const readOrder = (item) => ({
    startDate: item.startDate,
    displayOrder: item.displayOrder,
    usage: item.usage?.total ?? 0,
    createdAt: item.requestedAt,
    id: item.featurFacadeId,
  });

  const promotions = withRotationNotes(
    orderLandingPromotions(strip.items, readOrder),
    (item) => landingTieKey(readOrder(item)),
  ).map((item, index) => ({ ...item, onSite: index < LANDING_MAX_SLOTS }));

  const onSite = promotions.filter((item) => item.onSite);

  // Fillers top up the carousel, so they are counted against the same ceiling
  // the promotions are — though a strip short enough to need one is nowhere
  // near it, and this can only ever be the whole list.
  const fillers = await landingFillerSlots(onSite);

  return {
    ...strip,
    items: [...promotions, ...fillers],
    // What the strip is made of, kept apart from `total`: `total` is how many
    // promotions the query matched, which is what paging and "showing the first
    // n" read, and quietly folding placeholders into it would misreport both.
    promotions: strip.total,
    autoFilled: fillers.length,
    // How many of those promotions the landing page actually has room for. The
    // difference between this and `promotions` is the queue.
    onSite: onSite.length + fillers.length,
    minSlots: LANDING_MIN_SLOTS,
    maxSlots: LANDING_MAX_SLOTS,
  };
};

/**
 * Say, on each row, whether it is sharing its position and how often it moves.
 *
 * Without this the strip is inexplicable: an admin who set an order once and
 * finds it different after lunch has to be told the two facades are tied and
 * taking turns, not that somebody rearranged the front page behind them. `null`
 * on a row that holds its position outright, which is nearly all of them.
 */
const withRotationNotes = (items, priorityOf) => {
  const sizes = new Map();
  for (const item of items) {
    const key = priorityOf(item) ?? "—";
    sizes.set(key, (sizes.get(key) || 0) + 1);
  }

  return items.map((item) => {
    const sharedBy = sizes.get(priorityOf(item) ?? "—") || 1;
    return {
      ...item,
      rotation: sharedBy > 1
        ? { sharedBy, everyHours: rotationIntervalHours(sharedBy) }
        : null,
    };
  });
};

/**
 * The places the carousel is short, as the console has to show them.
 *
 * The landing page never renders fewer than `LANDING_MIN_SLOTS` facades: below
 * that the empty places are filled with the platform's most-used facades. This
 * screen is meant to be the front page as visitors see it, so those places are
 * shown here too — clearly marked, and never reorderable, because there is no
 * promotion behind them to number. They go the moment a real one is approved.
 *
 * Shaped like a request row on purpose, so the strip renders one kind of thing.
 * `featurFacadeId` is null, which is what tells the two apart.
 */
const landingFillerSlots = async (live) => {
  const missing = LANDING_MIN_SLOTS - live.length;
  if (missing <= 0) return [];

  const rows = await rankFillerFacades({
    exclude: live.map((item) => item.facadeId).filter(Boolean),
    limit: missing,
  });
  if (!rows.length) return [];

  // `imageResolver` reads `facade_image`; the ranking query selects the column
  // under its own name, since the public feed shares that SQL.
  const imageRows = rows.map((row) => ({ facade_image: row.image }));

  const [companyOf, imageOf] = await Promise.all([
    resolveCompanies(db, rows),
    imageResolver(imageRows),
  ]);

  return rows.map((row, index) => ({
    featurFacadeId: null,
    facadeId: row.facade_id,
    facade: {
      name: row.name,
      image: imageOf(imageRows[index]),
      dwellingType: row.dwelling_type_name || null,
      active: row.status,
    },
    company: companyOf(row),
    startDate: null,
    endDate: null,
    isActive: true,
    displayOrder: null,
    approvalStatus: null,
    windowState: null,
    // It really is on the site — that is the whole point of a filler. What it is
    // not is a promotion.
    liveNow: true,
    onSite: true,
    leadCount: 0,
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    requestedAt: null,
    autoFilled: true,
    // Ties on usage are the common case, not the exception — a run of facades on
    // four uses each takes turns in this slot around the clock, and the count is
    // the only thing that explains why the strip looks different every half hour.
    rotation: row.tie_size > 1
      ? { sharedBy: row.tie_size, everyHours: rotationIntervalHours(row.tie_size) }
      : null,
    // Why this facade and not another one. The same three counts the Facades
    // screen ranks by, so an admin can go and check the reasoning.
    usage: {
      total: row.total_uses,
      quotations: row.quotation_uses,
      houseLandPackages: row.house_land_package_uses,
      lotPackages: row.lot_package_uses,
    },
  }));
};

/**
 * Rewrite the carousel's running order.
 *
 * Takes the ids in the order they should appear and numbers them 1..n. Anything
 * not in the list — pending requests, scheduled promotions, soft-deleted rows —
 * is pushed out behind them, keeping its own relative order. That is what makes
 * the numbers mean something: without it a request created last week would
 * carry a low number and jump into the middle of the strip the day it went
 * live. Everything joins at the back and is promoted deliberately.
 *
 * Both statements run in one transaction. Half of this applied would leave two
 * facades on the same number, which the feed would then break by `created_at` —
 * an order nobody chose.
 */
export const reorderFeaturedFacadesService = async ({ ids }) => {
  const { sequelize, FeaturFacade } = db;

  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) {
    throw httpError(400, "The same facade appears twice in that order.");
  }

  // A stale screen is the likely cause: something was removed, or its window
  // closed, while the order was being dragged about. Saying so beats silently
  // numbering a list that no longer describes the site.
  const found = await FeaturFacade.count({
    where: { featur_facade_id: { [Op.in]: unique }, is_delete: false },
  });
  if (found !== unique.length) {
    throw httpError(
      409,
      "This list has changed since the screen loaded. Refresh and set the order again.",
    );
  }

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(
      `UPDATE featur_facade ff
          SET display_order = o.position
         FROM (
           SELECT id, ordinality::int AS position
             FROM unnest(ARRAY[:ids]::uuid[]) WITH ORDINALITY AS t(id, ordinality)
         ) o
        WHERE ff.featur_facade_id = o.id`,
      { replacements: { ids: unique }, type: QueryTypes.UPDATE, transaction },
    );

    // Reads the old numbers of the rows it is moving — the statement above
    // touched none of them — so the tail keeps the order it already had.
    await sequelize.query(
      `UPDATE featur_facade ff
          SET display_order = :size + rest.position
         FROM (
           SELECT featur_facade_id,
                  ROW_NUMBER() OVER (
                    ORDER BY display_order, created_at DESC, featur_facade_id
                  )::int AS position
             FROM featur_facade
            WHERE NOT (featur_facade_id = ANY(ARRAY[:ids]::uuid[]))
         ) rest
        WHERE ff.featur_facade_id = rest.featur_facade_id`,
      {
        replacements: { ids: unique, size: unique.length },
        type: QueryTypes.UPDATE,
        transaction,
      },
    );
  });

  await deleteCacheByPrefix(FEATUR_FACADE_CACHE_PREFIX);

  return getLandingOrderService();
};

/**
 * Feature a facade straight from the console, no builder request involved.
 *
 * The queue exists so a builder cannot publish to inBuildify's landing page
 * unreviewed. An admin doing it *is* the review, so the row is created already
 * approved and stamped with who did it — sending it to the pending list for the
 * same person to approve a second time would be theatre.
 *
 * `builder_id`/`company_id` come off the facade rather than the request. There
 * is no tenant on an admin session, and the promotion has to be anchored to the
 * builder who owns the facade for the landing page's enquiries to be routed
 * back to them.
 */
export const createFeaturedFacadeService = async ({ body, admin }) => {
  const { Facade, FeaturFacade } = db;

  const facade = await Facade.findByPk(body.facade_id, {
    attributes: ["facade_id", "name", "builder_id", "company_id"],
    raw: true,
  });
  if (!facade) throw httpError(404, "Facade not found.");

  const startDate = new Date(body.start_date);
  const endDate = new Date(body.end_date);
  if (endDate < startDate) {
    throw httpError(400, "The end date cannot be before the start date.");
  }

  // Only an outstanding promotion blocks a new one — see `featuredStateOf` on
  // the catalog side, which decides what the Feature button offers. The two
  // rules have to agree or the button promises something this refuses.
  const existing = await FeaturFacade.findOne({
    where: {
      facade_id: facade.facade_id,
      is_delete: false,
      approval_status: { [Op.ne]: FEATUR_FACADE_APPROVAL.REJECTED },
      [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: new Date() } }],
    },
    raw: true,
  });
  if (existing) {
    throw httpError(
      409,
      "This facade already has a featured window. Change it on the Featured facades screen.",
    );
  }

  const created = await FeaturFacade.create({
    facade_id: facade.facade_id,
    builder_id: facade.builder_id,
    company_id: facade.company_id,
    start_date: startDate,
    end_date: endDate,
    is_active: body.is_active !== false,
    approval_status: FEATUR_FACADE_APPROVAL.APPROVED,
    reviewed_at: new Date(),
    reviewed_by: admin?.platform_user_id || null,
    review_note: body.review_note || "Featured directly from the admin console.",
    // End of the carousel. Approving something does not earn it the top spot —
    // that is a separate decision, made on the ordering strip.
    display_order: await nextDisplayOrder(),
  });

  await deleteCacheByPrefix(FEATUR_FACADE_CACHE_PREFIX);

  return reshape(created.featur_facade_id);
};

const loadRequest = async (id) => {
  const { FeaturFacade } = db;
  const row = await FeaturFacade.findOne({
    where: { featur_facade_id: id, is_delete: false },
    raw: true,
  });
  if (!row) throw httpError(404, "Featured facade request not found.");
  if (!row.facade_id) {
    throw httpError(409, "The facade behind this request has been deleted.");
  }
  return row;
};

/** Read one row back through the list query, so a write answers in list shape. */
const reshape = async (id) => {
  const { items } = await listFeaturedFacadeRequestsService({
    query: { limit: 1, page: 1, featur_facade_id: id },
  });
  return items.find((item) => item.featurFacadeId === id) ?? null;
};

/**
 * Move a request to a decision.
 *
 * The public feed is cached for five minutes and keyed by page, so a decision
 * that only wrote the row would take effect whenever that entry happened to
 * expire. Clearing the prefix here is what makes approve mean "on the site now"
 * and reject mean "off it now".
 */
const decide = async ({ id, status, note, admin, alreadyMessage }) => {
  const { FeaturFacade } = db;

  const row = await loadRequest(id);
  if (row.approval_status === status) throw httpError(409, alreadyMessage);

  const reviewed = status !== FEATUR_FACADE_APPROVAL.PENDING;

  await FeaturFacade.update(
    {
      approval_status: status,
      reviewed_at: reviewed ? new Date() : null,
      reviewed_by: reviewed ? admin?.platform_user_id || null : null,
      review_note: reviewed ? note ?? row.review_note : null,
    },
    { where: { featur_facade_id: id } },
  );

  await deleteCacheByPrefix(FEATUR_FACADE_CACHE_PREFIX);

  return reshape(id);
};

export const approveFeaturedFacadeRequestService = ({ id, body, admin }) =>
  decide({
    id,
    status: FEATUR_FACADE_APPROVAL.APPROVED,
    note: body.review_note,
    admin,
    alreadyMessage: "This request has already been approved.",
  });

export const rejectFeaturedFacadeRequestService = ({ id, body, admin }) =>
  decide({
    id,
    status: FEATUR_FACADE_APPROVAL.REJECTED,
    note: body.review_note,
    admin,
    alreadyMessage: "This request has already been rejected.",
  });

/**
 * Undo a decision — the row goes back to the queue and off the site until
 * somebody looks at it again. The same escape hatch the other admin queues
 * have: an approval given by mistake must be recoverable without asking the
 * builder to re-submit.
 */
export const reopenFeaturedFacadeRequestService = ({ id }) =>
  decide({
    id,
    status: FEATUR_FACADE_APPROVAL.PENDING,
    alreadyMessage: "This request is already waiting for review.",
  });

/**
 * Take a facade off the landing page for good.
 *
 * The difference from `reopen` is what happens next: reopening leaves the
 * builder's request standing, waiting on somebody here, so it can go back up.
 * Removing ends it — the row is gone from the queue and the facade is free to
 * be featured again from scratch, by the builder or from the Facades screen.
 *
 * Soft-deleted, never removed. `featured_facade_lead` cascades from this table,
 * and the enquiries captured while the facade *was* on the site are real leads
 * inside a builder's CRM; deleting the promotion outright would take them with
 * it. The tenant-side delete does the same, and the `is_active` flip alongside
 * it matches how orphaned promotions were retired.
 */
export const removeFeaturedFacadeService = async ({ id }) => {
  const { FeaturFacade } = db;

  const row = await FeaturFacade.findOne({
    where: { featur_facade_id: id, is_delete: false },
    raw: true,
  });
  if (!row) throw httpError(404, "Featured facade not found.");

  await FeaturFacade.update(
    { is_delete: true, is_active: false },
    { where: { featur_facade_id: id } },
  );

  await deleteCacheByPrefix(FEATUR_FACADE_CACHE_PREFIX);

  // Nothing to reshape: the row no longer exists as far as every read on this
  // module is concerned, so the caller gets the id it removed and refetches.
  return { featurFacadeId: id, facadeId: row.facade_id, removed: true };
};

export default {
  listFeaturedFacadeRequestsService,
  getFeaturedFacadeStatsService,
  getLandingOrderService,
  reorderFeaturedFacadesService,
  createFeaturedFacadeService,
  approveFeaturedFacadeRequestService,
  rejectFeaturedFacadeRequestService,
  reopenFeaturedFacadeRequestService,
  removeFeaturedFacadeService,
};
