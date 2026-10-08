import { QueryTypes } from "sequelize";

import db from "../../../config/database/models/postgre-models/index.js";
import { isUuid, s3UrlForKey } from "../../../helper/imageDriveFile.helper.js";
import { parsePagination, listEnvelope, resolveCompanies } from "../admin.helper.js";

export const USAGE_SORTS = ["most_used", "least_used", "name"];

const sortClause = (sort, alias = "total_uses") => {
  if (sort === "least_used") return `${alias} ASC, name ASC`;
  if (sort === "name") return "name ASC";
  return `${alias} DESC, name ASC`;
};

/**
 * The facade's current promotion, as the Feature button needs to read it.
 *
 * `null` means nothing is outstanding and the facade can be featured from here.
 * A row that is rejected or whose window has already ended is deliberately
 * treated the same way: neither is on the site, neither is waiting on anybody,
 * and refusing to re-feature a facade whose run finished last month would send
 * an admin to the queue for a button that is not there.
 */
const featuredStateOf = (row, now = new Date()) => {
  if (!row.featur_facade_id) return null;

  const expired = Boolean(row.end_date) && new Date(row.end_date) < now;
  const rejected = row.approval_status === "rejected";
  if (expired || rejected) return null;

  return {
    featurFacadeId: row.featur_facade_id,
    approvalStatus: row.approval_status,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.promotion_active,
    liveNow: row.live_now === true,
  };
};

/**
 * "Used" means somebody built something on this facade: picked it on a quotation
 * version, or put it on a house & land or lot package. The counts are returned
 * broken out as well as summed, so a zero on quotations is explainable rather
 * than just empty.
 *
 * Deliberately not counting `featur_facade` rows. Being promoted is something
 * done *to* a facade, not a use of it — and counting it made the number circular
 * where it is read: this ranking is what picks the facades the landing page
 * fills its spare slots with, so a facade would have been promoted partly
 * because it had been promoted before. It also flattered the count in a way that
 * did not survive being asked about — a facade featured six times and quoted
 * twice read as "8 uses" next to one genuinely quoted eight times.
 */
export const listFacadesService = async ({ query }) => {
  const { sequelize } = db;
  const { page, limit, offset } = parsePagination(query);
  const sort = USAGE_SORTS.includes(query.sort) ? query.sort : "most_used";

  // Sample-data facades are never platform catalogue. They were seeded into one
  // builder's account so a new sign-up has something to click, they get purged
  // from Settings → Sample Data, and nobody but that builder ever meant them to
  // exist — so they have no business being ranked against real facades on this
  // screen, or being offered a Feature button that would put a demo row on the
  // front page.
  const filters = ["f.is_sample_data = false"];
  const replacements = { limit, offset };

  if (query.search) {
    filters.push("f.name ILIKE :search");
    replacements.search = `%${String(query.search).trim()}%`;
  }
  if (query.company_id) {
    filters.push("(f.company_id = :companyId OR f.builder_id = :companyId)");
    replacements.companyId = query.company_id;
  }
  if (query.status !== undefined && query.status !== "") {
    filters.push("f.status = :status");
    replacements.status = query.status === "true" || query.status === true;
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const baseSelect = `
    SELECT f.facade_id, f.name, f.image, f.status, f.best_faced, f.cost, f.cost_type,
           f.company_id, f.builder_id, f.dwelling_type_id, f.created_at,
           dt.name AS dwelling_type_name,
           cur.featur_facade_id, cur.approval_status, cur.start_date, cur.end_date,
           cur.is_active AS promotion_active, cur.live_now,
           COALESCE(qv.cnt, 0)::int  AS quotation_uses,
           COALESCE(hlp.cnt, 0)::int AS house_land_package_uses,
           COALESCE(lp.cnt, 0)::int  AS lot_package_uses,
           (COALESCE(qv.cnt,0) + COALESCE(hlp.cnt,0) + COALESCE(lp.cnt,0))::int AS total_uses
      FROM facade f
      LEFT JOIN dwelling_type dt ON dt.dwelling_type_id = f.dwelling_type_id
      LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM quotation_version   WHERE facade_id IS NOT NULL GROUP BY 1) qv  ON qv.facade_id  = f.facade_id
      LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM house_land_package  WHERE facade_id IS NOT NULL GROUP BY 1) hlp ON hlp.facade_id = f.facade_id
      LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM lot_package         WHERE facade_id IS NOT NULL GROUP BY 1) lp  ON lp.facade_id  = f.facade_id
      -- The promotion this facade's Feature button has to speak for. A facade
      -- can carry several over its life, so one is picked the way a person
      -- would: whatever is on the site now, else the most recent window. The
      -- count above is history; this is the current state.
      LEFT JOIN LATERAL (
        SELECT p.featur_facade_id, p.approval_status, p.start_date, p.end_date, p.is_active,
               (p.approval_status = 'approved'
                AND p.is_active = true
                AND (p.start_date IS NULL OR p.start_date <= NOW())
                AND (p.end_date   IS NULL OR p.end_date   >= NOW())) AS live_now
          FROM featur_facade p
         WHERE p.facade_id = f.facade_id
           AND p.is_delete = false
         -- NULLS LAST on both: DESC defaults to NULLS FIRST in Postgres, which
         -- would rank a promotion with no is_active above one that is provably
         -- on the site right now.
         ORDER BY live_now DESC NULLS LAST, p.start_date DESC NULLS LAST
         LIMIT 1
      ) cur ON true
      ${where}`;

  const [rows, [{ count }]] = await Promise.all([
    sequelize.query(`${baseSelect} ORDER BY ${sortClause(sort)} LIMIT :limit OFFSET :offset`, {
      replacements, type: QueryTypes.SELECT,
    }),
    sequelize.query(`SELECT COUNT(*)::int AS count FROM facade f ${where}`, {
      replacements, type: QueryTypes.SELECT,
    }),
  ]);

  // facade.image stores a DriveFile UUID, not a URL — the same resolve the
  // tenant-side facade service does, batched for the page.
  const imageIds = rows.map((row) => row.image).filter(isUuid);
  const [companyOf, driveFiles] = await Promise.all([
    resolveCompanies(db, rows),
    imageIds.length
      ? db.DriveFile.findAll({
        where: { file_id: imageIds },
        attributes: ["file_id", "s3_key"],
        raw: true,
      })
      : [],
  ]);

  const urlMap = new Map(driveFiles.map((file) => [file.file_id, s3UrlForKey(file.s3_key)]));

  const items = rows.map((row) => ({
    facadeId: row.facade_id,
    name: row.name,
    image: isUuid(row.image) ? urlMap.get(row.image) ?? null : row.image,
    status: row.status,
    bestFacade: row.best_faced,
    cost: row.cost === null ? null : Number(row.cost),
    costType: row.cost_type,
    dwellingType: row.dwelling_type_id
      ? { dwellingTypeId: row.dwelling_type_id, name: row.dwelling_type_name }
      : null,
    company: companyOf(row),
    usage: {
      total: row.total_uses,
      quotations: row.quotation_uses,
      houseLandPackages: row.house_land_package_uses,
      lotPackages: row.lot_package_uses,
    },
    featured: featuredStateOf(row),
    createdAt: row.created_at,
  }));

  return listEnvelope(items, count, page, limit);
};

export const listDwellingsService = async ({ query }) => {
  const { sequelize } = db;
  const { page, limit, offset } = parsePagination(query);
  const sort = USAGE_SORTS.includes(query.sort) ? query.sort : "most_used";

  // Seeded dwelling types are one builder's demo data, not the platform's —
  // same reasoning as the facade list above.
  const filters = ["d.is_sample_data = false"];
  const replacements = { limit, offset };

  if (query.search) {
    filters.push("d.name ILIKE :search");
    replacements.search = `%${String(query.search).trim()}%`;
  }
  if (query.company_id) {
    filters.push("(d.company_id = :companyId OR d.builder_id = :companyId)");
    replacements.companyId = query.company_id;
  }
  if (query.status !== undefined && query.status !== "") {
    filters.push("d.is_active = :status");
    replacements.status = query.status === "true" || query.status === true;
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const baseSelect = `
    SELECT d.dwelling_type_id, d.name, d.is_active, d.company_id, d.builder_id, d.created_at,
           COALESCE(qv.cnt, 0)::int  AS quotation_uses,
           COALESCE(fp.cnt, 0)::int  AS floor_plan_uses,
           COALESCE(fa.cnt, 0)::int  AS facade_uses,
           COALESCE(hlp.cnt, 0)::int AS house_land_package_uses,
           COALESCE(lp.cnt, 0)::int  AS lot_package_uses,
           (COALESCE(qv.cnt,0) + COALESCE(fp.cnt,0) + COALESCE(fa.cnt,0) + COALESCE(hlp.cnt,0) + COALESCE(lp.cnt,0))::int AS total_uses
      FROM dwelling_type d
      LEFT JOIN (SELECT dwelling_type_id, COUNT(*) cnt FROM quotation_version  WHERE dwelling_type_id IS NOT NULL GROUP BY 1) qv  ON qv.dwelling_type_id  = d.dwelling_type_id
      LEFT JOIN (SELECT dwelling_type_id, COUNT(*) cnt FROM floor_plan         WHERE dwelling_type_id IS NOT NULL GROUP BY 1) fp  ON fp.dwelling_type_id  = d.dwelling_type_id
      LEFT JOIN (SELECT dwelling_type_id, COUNT(*) cnt FROM facade             WHERE dwelling_type_id IS NOT NULL GROUP BY 1) fa  ON fa.dwelling_type_id  = d.dwelling_type_id
      LEFT JOIN (SELECT dwelling_type_id, COUNT(*) cnt FROM house_land_package WHERE dwelling_type_id IS NOT NULL GROUP BY 1) hlp ON hlp.dwelling_type_id = d.dwelling_type_id
      LEFT JOIN (SELECT dwelling_type_id, COUNT(*) cnt FROM lot_package        WHERE dwelling_type_id IS NOT NULL GROUP BY 1) lp  ON lp.dwelling_type_id  = d.dwelling_type_id
      ${where}`;

  const [rows, [{ count }]] = await Promise.all([
    sequelize.query(`${baseSelect} ORDER BY ${sortClause(sort)} LIMIT :limit OFFSET :offset`, {
      replacements, type: QueryTypes.SELECT,
    }),
    sequelize.query(`SELECT COUNT(*)::int AS count FROM dwelling_type d ${where}`, {
      replacements, type: QueryTypes.SELECT,
    }),
  ]);

  const companyOf = await resolveCompanies(db, rows);

  const items = rows.map((row) => ({
    dwellingTypeId: row.dwelling_type_id,
    name: row.name,
    isActive: row.is_active,
    company: companyOf(row),
    usage: {
      total: row.total_uses,
      quotations: row.quotation_uses,
      floorPlans: row.floor_plan_uses,
      facades: row.facade_uses,
      houseLandPackages: row.house_land_package_uses,
      lotPackages: row.lot_package_uses,
    },
    createdAt: row.created_at,
  }));

  return listEnvelope(items, count, page, limit);
};

export default { listFacadesService, listDwellingsService };
