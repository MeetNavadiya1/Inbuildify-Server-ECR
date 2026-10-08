import { QueryTypes } from "sequelize";

import db from "../../config/database/models/postgre-models/index.js";
import { env } from "../../config/env.config.js";
import { s3UrlForKey } from "../../helper/imageDriveFile.helper.js";
import { dayMillis, MS_PER_DAY } from "./landing-rotation.js";

/**
 * Keeping the landing carousel full.
 *
 * The carousel is a fixed piece of the front page, not a list that shrinks: with
 * two approved promotions live it read as a broken row of gaps, and on a week
 * where nobody asked to be featured it disappeared entirely. So the strip has a
 * floor — below it the empty places are filled with the facades the platform
 * actually uses most, the same ranking the admin console's Facades screen sorts
 * by.
 *
 * A filler is not a promotion. Nobody paid for it, nobody approved it, and it
 * carries no `featur_facade_id`; it holds a place until a real promotion takes
 * it. That is why fillers always sit *behind* every live promotion and can never
 * be reordered — the paid positions are the ones that were chosen.
 */

/**
 * The fewest places the carousel has, promotions and fillers together.
 *
 * `LANDING_MIN_SLOTS` in the environment, defaulting to 6.
 */
export const LANDING_MIN_SLOTS = env.LANDING_CAROUSEL.MIN_SLOTS;

/**
 * The most places the carousel has — live promotions only, since fillers never
 * appear above the floor and so can never reach this.
 *
 * A ceiling as well as a floor, for the same reason: the strip is a fixed piece
 * of the front page. Unbounded, a busy month puts fifty facades on it, every one
 * of them further from being seen than if there were ten, and the front page
 * turns into a catalogue.
 *
 * Promotions past the last place are held, not dropped: they keep their approval
 * and their window, and take a place as soon as one above them expires or is
 * switched off. Which of them are on the site is the admin console's decision,
 * not this file's — the strip is cut after `display_order` has ranked it, so
 * moving a promotion up the running order is what brings it onto the page.
 *
 * `LANDING_MAX_SLOTS` in the environment, defaulting to 20, and never below the
 * floor.
 */
export const LANDING_MAX_SLOTS = env.LANDING_CAROUSEL.MAX_SLOTS;

/**
 * Facades ranked by how much the platform uses them.
 *
 * Same three counts as `listFacadesService` in the admin catalog — quotations,
 * house & land packages, lot packages — so a facade that fills a slot here is
 * the one sitting at the top of the Facades screen, and the two screens can't
 * disagree about what "most used" means.
 *
 * Promotions are not one of them, and this is the query that most needs them not
 * to be: a facade the platform put on the front page would otherwise count that
 * as a reason to put it there again, and the strip would slowly narrow to the
 * facades it had already shown.
 *
 * Active facades with an image only. A filler is decoration on the front page:
 * one the builder switched off, or one with nothing to show, is worse than the
 * gap it was filling.
 *
 * Facades on the same number of uses share their places rather than queueing
 * behind whoever uploaded first — see `landing-rotation.js`. That has to happen
 * in SQL, not on the rows this returns: usage ties run deep (a young platform
 * has hundreds of facades on nothing at all) and the run that decides the last
 * filled slot is far bigger than the handful of rows a page asks for, so a
 * rotation applied after `LIMIT` would only ever shuffle the few that had
 * already won.
 */
export const rankFillerFacades = async ({ exclude = [], limit, offset = 0, now = new Date() }) => {
  if (!limit || limit <= 0) return [];

  // `facade.image` is a uuid FK to drive_file, so "has an image" is a null check
  // and nothing more — comparing the column against '' would throw.
  //
  // Sample-data facades are excluded for the same reason the admin Facades
  // screen excludes them, only it matters more here: a seeded demo row is a
  // fixture in one builder's trial account, and putting it on the public front
  // page shows the whole site something nobody uploaded and nobody sells.
  const filters = ["f.status = true", "f.image IS NOT NULL", "f.is_sample_data = false"];
  const replacements = { limit, offset, dayMillis: dayMillis(now), msPerDay: MS_PER_DAY };

  // Built conditionally rather than with an always-present `NOT (... = ANY(...))`:
  // an empty replacement array is not a thing Sequelize can render into an array
  // literal, and the common case for a filler is a carousel with nothing in it.
  if (exclude.length) {
    filters.push("NOT (f.facade_id = ANY(ARRAY[:exclude]::uuid[]))");
    replacements.exclude = exclude;
  }

  return db.sequelize.query(
    `WITH ranked AS (
       SELECT f.facade_id, f.name, f.image, f.status, f.best_faced,
              f.builder_id, f.company_id, f.dwelling_type_id, f.created_at,
              dt.name AS dwelling_type_name,
              COALESCE(qv.cnt, 0)::int  AS quotation_uses,
              COALESCE(hlp.cnt, 0)::int AS house_land_package_uses,
              COALESCE(lp.cnt, 0)::int  AS lot_package_uses,
              (COALESCE(qv.cnt,0) + COALESCE(hlp.cnt,0) + COALESCE(lp.cnt,0))::int AS total_uses
         FROM facade f
         LEFT JOIN dwelling_type dt ON dt.dwelling_type_id = f.dwelling_type_id
         LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM quotation_version  WHERE facade_id IS NOT NULL GROUP BY 1) qv  ON qv.facade_id  = f.facade_id
         LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM house_land_package WHERE facade_id IS NOT NULL GROUP BY 1) hlp ON hlp.facade_id = f.facade_id
         LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM lot_package        WHERE facade_id IS NOT NULL GROUP BY 1) lp  ON lp.facade_id  = f.facade_id
        WHERE ${filters.join(" AND ")}
     ),
     tied AS (
       -- How big the run of equal usage is, and where this facade stands in it
       -- before the day is taken into account. created_at/facade_id fix that
       -- sequence: the rotation turns a fixed run, and a run that reshuffled
       -- underneath it would make the carousel flicker between requests rather
       -- than change on the boundary.
       SELECT r.*,
              (COUNT(*)    OVER run)::int AS tie_size,
              (ROW_NUMBER() OVER run_order)::int AS tie_rank
         FROM ranked r
        WINDOW run       AS (PARTITION BY r.total_uses),
               run_order AS (PARTITION BY r.total_uses ORDER BY r.created_at DESC, r.facade_id)
     )
     SELECT t.*,
            -- The seat this facade takes in its own run right now. Rotating left
            -- by one place per slice is what gives every member of an N-way tie
            -- the lead for 24/N hours and then sends it to the back of the run
            -- rather than out of it. Wrapped twice because Postgres' modulo
            -- keeps the sign of its left operand.
            --
            -- All integers, and multiplied before it is divided, so this agrees
            -- with rotationSlice() exactly. Given the day as a fraction instead,
            -- Postgres' exact numeric makes a third of a day times three
            -- 0.9999999999999999 and floors it to the previous slice, where
            -- Javascript's binary doubles round it to 1 — the two would then
            -- disagree about the order on every boundary that does not divide
            -- cleanly, which is most of them.
            ((((t.tie_rank - 1) - ((:dayMillis::bigint * t.tie_size) / :msPerDay)::int) % t.tie_size)
              + t.tie_size) % t.tie_size AS rotation_slot
       FROM tied t
      ORDER BY t.total_uses DESC, rotation_slot, t.created_at DESC, t.facade_id
      LIMIT :limit OFFSET :offset`,
    { replacements, type: QueryTypes.SELECT },
  );
};

/**
 * Filler slots shaped exactly like a row of the public carousel feed.
 *
 * Loaded back through the model rather than widened out of the ranking query so
 * a filler carries the same builder, floor plan and resolved image URL as a real
 * promotion — the landing site renders one card, and it must not have to know
 * which kind it was handed. The one honest difference is `featur_facade_id`,
 * which is null: there is no promotion behind this, and an enquiry on it has
 * nothing to attribute itself to.
 */
export const listLandingFillerFacades = async ({ exclude = [], limit, offset = 0, now = new Date() }) => {
  const ranked = await rankFillerFacades({ exclude, limit, offset, now });
  if (!ranked.length) return [];

  const ids = ranked.map((row) => row.facade_id);

  const facades = await db.Facade.findAll({
    where: { facade_id: ids },
    include: [
      { model: db.Builder, as: "builder", attributes: ["name"] },
      {
        model: db.FloorPlanFacadeMap,
        as: "floorPlanMaps",
        include: [
          {
            model: db.FloorPlan,
            as: "floorPlan",
            attributes: ["total_area", "beds", "baths", "carpark"],
          },
        ],
      },
      {
        model: db.DriveFile,
        as: "facadeImageFile",
        attributes: ["file_id", "s3_key"],
        required: false,
      },
    ],
  });

  const byId = new Map(facades.map((row) => [row.facade_id, row.get({ plain: true })]));

  return ranked
    .map((row) => {
      const facade = byId.get(row.facade_id);
      if (!facade) return null;

      const floorPlan = facade.floorPlanMaps?.[0]?.floorPlan || null;
      const imageUrl = facade.facadeImageFile ? s3UrlForKey(facade.facadeImageFile.s3_key) : null;
      delete facade.floorPlanMaps;
      delete facade.facadeImageFile;

      return {
        featur_facade_id: null,
        ...facade,
        image: imageUrl,
        floorPlan,
        // Lets the landing site tell a paid position from a filled one — it has
        // to, because a filler has no promotion to attach an enquiry to.
        is_filler: true,
        usage_total: row.total_uses,
      };
    })
    // A facade deleted between the ranking and the load: the slot is better left
    // short than filled with nothing.
    .filter(Boolean);
};

/**
 * How much each of these facades is built on, as a Map keyed by facade id.
 *
 * The same three counts `rankFillerFacades` sums, pulled out so the feed can
 * rank promotions by usage without repeating the definition of the word. A
 * facade nobody has used is absent from the Map rather than present as 0 — the
 * caller defaults it, and a missing row and a zero row mean the same thing here.
 *
 * Separate from the ranking query above because the callers want different
 * things: that one chooses facades by usage, this one is handed a set somebody
 * else already chose and only has to score it.
 */
export const usageTotalsFor = async (facadeIds) => {
  const ids = [...new Set(facadeIds.filter(Boolean))];
  if (!ids.length) return new Map();

  const rows = await db.sequelize.query(
    `SELECT f.facade_id,
            (COALESCE(qv.cnt,0) + COALESCE(hlp.cnt,0) + COALESCE(lp.cnt,0))::int AS total_uses
       FROM facade f
       LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM quotation_version  WHERE facade_id IS NOT NULL GROUP BY 1) qv  ON qv.facade_id  = f.facade_id
       LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM house_land_package WHERE facade_id IS NOT NULL GROUP BY 1) hlp ON hlp.facade_id = f.facade_id
       LEFT JOIN (SELECT facade_id, COUNT(*) cnt FROM lot_package        WHERE facade_id IS NOT NULL GROUP BY 1) lp  ON lp.facade_id  = f.facade_id
      WHERE f.facade_id = ANY(ARRAY[:ids]::uuid[])`,
    { replacements: { ids }, type: QueryTypes.SELECT },
  );

  return new Map(rows.map((row) => [row.facade_id, row.total_uses]));
};

export default {
  LANDING_MIN_SLOTS,
  LANDING_MAX_SLOTS,
  rankFillerFacades,
  listLandingFillerFacades,
  usageTotalsFor,
};
