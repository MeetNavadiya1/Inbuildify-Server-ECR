import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { s3UrlForKey } from "../../helper/imageDriveFile.helper.js";
import { FEATUR_FACADE_APPROVAL } from "../../config/database/models/postgre-models/featur_facade.model.js";
import {
    LANDING_MIN_SLOTS,
    LANDING_MAX_SLOTS,
    listLandingFillerFacades,
    usageTotalsFor,
} from "./landing-fill.service.js";
import { orderLandingPromotions } from "./landing-rotation.js";

/**
 * Redis key prefix for everything cached off this table.
 *
 * Lives here rather than in the controller because the admin console clears the
 * same cache: approving a promotion has to take effect on the landing site now,
 * not up to five minutes later when the list entry expires.
 */
export const FEATUR_FACADE_CACHE_PREFIX = "featur_facade:";

/**
 * What a visitor sees right now: approved, switched on, inside its window.
 *
 * Pulled out of the feed query because the top-up below has to count and list
 * the same set — a filler chosen against a different definition of "live" would
 * either duplicate a facade already in the carousel or leave a gap that is not
 * there.
 */
const liveFeedWhere = (now) => ({
    is_active: true,
    is_delete: false,
    // The platform team's gate. A builder can create and schedule a promotion
    // freely, but this is inBuildify's own landing page — nothing reaches it
    // until an admin approves the request in the console.
    approval_status: FEATUR_FACADE_APPROVAL.APPROVED,
    // Only surface facades whose scheduled window covers "now"
    [Op.and]: [
        { [Op.or]: [{ start_date: { [Op.lte]: now } }, { start_date: null }] },
        { [Op.or]: [{ end_date: { [Op.gte]: now } }, { end_date: null }] },
    ],
});

export async function getFeatureFacadeService({ page, limit }) {
    try {
        const now = new Date();

        // Automatically set is_active to false if end_date has passed
        await db.FeaturFacade.update(
            { is_active: false },
            {
                where: {
                    is_active: true,
                    end_date: { [Op.lt]: now },
                },
            }
        );

        const where = liveFeedWhere(now);

        // The carousel's running order, set by the admin console. Until this
        // existed the query had no ORDER BY, so the strip showed whatever
        // Postgres happened to return — and paging an unordered query can repeat
        // one facade on page 2 while dropping another. `created_at` is the
        // tiebreak: two promotions can share a number briefly, since a new row
        // takes MAX + 1 without locking the table.
        //
        // Read as ids first, and paged here rather than in SQL, because
        // promotions sharing a number share the position — the run has to be
        // rotated whole before a page is cut out of it, or the rotation would
        // only reach the members that happened to land on the same page.
        const live = await db.FeaturFacade.findAll({
            where: { ...where, facade_id: { [Op.ne]: null } },
            attributes: ["featur_facade_id", "facade_id", "display_order", "start_date", "created_at"],
            order: [
                ["display_order", "ASC"],
                ["created_at", "DESC"],
                ["featur_facade_id", "ASC"],
            ],
            raw: true,
        });

        // Promotions that went up on the same day are ranked by usage, not by
        // the order they happened to be created in — see
        // `orderLandingPromotions` for the whole rule. Scored after the query
        // rather than joined into it because the sort runs over the whole live
        // set, which is small enough to order in memory.
        //
        // `??` rather than `||` so a facade with a genuine 0 is not confused
        // with one the usage query had nothing to say about.
        const usageOf = await usageTotalsFor(live.map((row) => row.facade_id));

        const rotated = orderLandingPromotions(
            live,
            (row) => ({
                startDate: row.start_date,
                displayOrder: row.display_order,
                usage: usageOf.get(row.facade_id) ?? 0,
                createdAt: row.created_at,
                id: row.featur_facade_id,
            }),
            now,
        );

        // The carousel's ceiling, applied after the rotation and before the page
        // is cut. After, because a run of promotions sharing the number that
        // straddles the cut takes turns across it — each of them holds the last
        // place on the site for its share of the day, rather than the ones that
        // happened to sort low being off the site permanently. Before, because
        // the cap is the carousel's, not the page's: it has to hold however the
        // caller pages through it.
        const carousel = rotated.slice(0, LANDING_MAX_SLOTS);

        const pageIds = carousel
            .slice((page - 1) * limit, (page - 1) * limit + limit)
            .map((row) => row.featur_facade_id);

        // Only this page's rows carry the joins. `IN` has no order of its own,
        // so the page is put back into carousel order below.
        const result = pageIds.length ? await db.FeaturFacade.findAll({
            where: { featur_facade_id: pageIds },
            include: [
                {
                    model: db.Facade,
                    as: "facade",
                    required: true,
                    include: [
                        {
                            model: db.Builder,
                            as: "builder",
                            attributes: ["name"],
                        },
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
                },
            ],
        }) : [];

        const loaded = new Map(result.map((item) => [item.featur_facade_id, item]));

        const items = pageIds.map((id) => {
            const item = loaded.get(id);
            const facade = item?.facade?.get({ plain: true });
            if (facade) {
                const floorPlan = facade.floorPlanMaps?.[0]?.floorPlan || null;
                // Resolve image UUID → S3 URL via the joined DriveFile row
                const imageUrl = facade.facadeImageFile
                    ? s3UrlForKey(facade.facadeImageFile.s3_key)
                    : null;
                delete facade.floorPlanMaps;
                delete facade.facadeImageFile;
                return { featur_facade_id: item.featur_facade_id, ...facade, image: imageUrl, floorPlan };
            }
            return null;
        }).filter(Boolean);

        // Awaited rather than returned so a failure here lands in the catch
        // below, the same as every other read in this function.
        return await withFillerSlots({ items, live: carousel, page, limit, now });
    } catch (error) {
        return error;
    }
}

/**
 * Top the carousel up to its minimum with the most-used facades.
 *
 * The floor applies to the carousel, not to the page: with five promotions live
 * one filler is added, and it lands after all five wherever the page boundary
 * happens to fall. Nothing is added once there are enough promotions to fill the
 * strip — a busy landing page is never padded.
 *
 * `live` is the rotated list of live promotions the caller already read, so this
 * neither re-queries them nor risks counting a different set than the one above
 * it put on the page.
 */
async function withFillerSlots({ items, live, page, limit, now }) {
    const liveTotal = live.length;

    const missing = LANDING_MIN_SLOTS - liveTotal;
    if (missing <= 0) return items;

    const offset = (page - 1) * limit;
    // Where this page starts inside the filler tail, and how much of the page is
    // left for it once the live promotions have taken their places.
    const fillerOffset = Math.max(0, offset - liveTotal);
    const fillerLimit = Math.min(limit - items.length, missing - fillerOffset);
    if (fillerLimit <= 0) return items;

    const fillers = await listLandingFillerFacades({
        // Every live promotion, not just this page's — a filler that repeats a
        // facade already in the carousel is the one thing this must not do.
        exclude: [...new Set(live.map((row) => row.facade_id).filter(Boolean))],
        limit: fillerLimit,
        offset: fillerOffset,
        now,
    });

    return [...items, ...fillers];
}

/**
 * Every promotion belonging to the caller, whatever its window.
 *
 * Deliberately not the landing feed: that one hides anything outside its
 * start/end window, which is right for the public site and wrong for the admin
 * screen — a facade scheduled for next week has to keep showing as featured
 * there. Returns the dates and the active flag so the UI can label the state.
 *
 * The approval columns come back for the same reason: a promotion waiting on
 * the platform team is not live whatever its window says, and the builder has
 * to be able to see that rather than wonder why the site never changed.
 */
export async function getManagedFeatureFacadeService({ builderId, companyId, page, limit }) {
    return db.FeaturFacade.findAll({
        where: {
            builder_id: builderId,
            company_id: companyId,
            is_delete: false,
            // Skip promotions orphaned by a facade delete. The public feed drops
            // these via its required join on Facade; this list has no join, so it
            // has to say so. New deletes retire their promotions, but rows
            // predating that fix are still out there.
            facade_id: { [Op.ne]: null },
        },
        attributes: [
            "featur_facade_id",
            "facade_id",
            "start_date",
            "end_date",
            "is_active",
            "approval_status",
            "reviewed_at",
            "review_note",
        ],
        limit: limit,
        offset: (page - 1) * limit,
        order: [["start_date", "DESC"]],
    });
}

/**
 * The number a brand new promotion takes: the end of the strip.
 *
 * Appending rather than inserting is the only choice that needs no opinion —
 * nobody creating a promotion, builder or admin, is in a position to say it
 * belongs above someone else's. Reordering is the admin console's job.
 *
 * Not locked. Two promotions created in the same instant can land on the same
 * number, which the feed's `created_at` tiebreak settles and the next reorder
 * cleans up; taking a table lock to avoid a cosmetic tie in a carousel would be
 * a poor trade.
 */
export async function nextDisplayOrder() {
    const max = await db.FeaturFacade.max("display_order", {
        where: { is_delete: false },
    });
    return (Number.isFinite(max) ? max : 0) + 1;
}

export async function createFeatureFacadeService({
    builder_id,
    company_id,
    start_date,
    end_date,
    is_active,
    facade_id,
}) {
    try {
        const existingFacade = await db.FeaturFacade.findOne({
            where: {
                builder_id,
                company_id,
                start_date,
                end_date,
                is_active,
                facade_id,
                is_delete: false
            }
        })

        if (existingFacade) {
            throw new Error("Feature Facade already exists.");
        }
        const result = await db.FeaturFacade.create({
            builder_id,
            company_id,
            start_date,
            end_date,
            is_active,
            facade_id,
            // Not the caller's to set. Every promotion enters the admin console's
            // queue, whatever the request body says — and joins the back of the
            // carousel, not the front of it.
            approval_status: FEATUR_FACADE_APPROVAL.PENDING,
            display_order: await nextDisplayOrder(),
        });
        return result;
    } catch (error) {
        return error;
    }
}

export async function getFeatureFacadeByIdService({ id, builderId, companyId }) {
    try {
        const where = {
            featur_facade_id: id,
            builder_id: builderId,
            company_id: companyId,
            is_delete: false
        };

        const result = await db.FeaturFacade.findOne({
            where,
            include: [
                {
                    model: db.Facade,
                    as: "facade",
                    include: [
                        {
                            model: db.Builder,
                            as: "builder",
                            attributes: ["name"],
                        },
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
                },
            ],
        });

        if (!result) {
            throw new Error("Feature Facade not found");
        }
        const facade = result.facade?.get({ plain: true });
        if (facade) {
            const floorPlan = facade.floorPlanMaps?.[0]?.floorPlan || null;
            // Resolve image UUID → S3 URL via the joined DriveFile row
            const imageUrl = facade.facadeImageFile
                ? s3UrlForKey(facade.facadeImageFile.s3_key)
                : null;
            delete facade.floorPlanMaps;
            delete facade.facadeImageFile;
            return { ...facade, image: imageUrl, floorPlan, featur_facade_id: result.featur_facade_id };
        }
        return null;
    } catch (error) {
        throw error;
    }
}

/** Same instant? Either side may be null, a string or a Date. */
const sameMoment = (a, b) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return new Date(a).getTime() === new Date(b).getTime();
};

export async function updateFeatureFacadeService({
    id,
    builderId,
    companyId,
    payload,
}) {
    try {
        const where = {
            featur_facade_id: id,
            builder_id: builderId,
            company_id: companyId,
            is_delete: false
        };

        const current = await db.FeaturFacade.findOne({ where, raw: true });
        if (!current) {
            throw new Error("Feature Facade not found");
        }

        // Moving the window is a new ask, so it goes back to the queue: an
        // approval covers the dates that were approved, not whatever dates the
        // row is edited to afterwards. Toggling `is_active` is exempt — that
        // only ever takes a promotion down, and having to re-queue to pause
        // something would be a reason not to pause it.
        const windowChanged =
            (payload.start_date !== undefined && !sameMoment(payload.start_date, current.start_date)) ||
            (payload.end_date !== undefined && !sameMoment(payload.end_date, current.end_date));

        const next = windowChanged
            ? {
                ...payload,
                approval_status: FEATUR_FACADE_APPROVAL.PENDING,
                reviewed_at: null,
                reviewed_by: null,
                review_note: null,
            }
            : payload;

        const [updatedCount] = await db.FeaturFacade.update(next, {
            where
        });

        if (updatedCount === 0) {
            throw new Error("Feature Facade not found");
        }

        return await db.FeaturFacade.findOne({
            where
        });
    } catch (error) {
        return error;
    }
}

export async function deleteFeatureFacadeService({ id, builderId, companyId }) {
    try {
        const where = {
            featur_facade_id: id,
            builder_id: builderId,
            company_id: companyId,
        };

        const [updatedCount] = await db.FeaturFacade.update(
            { is_delete: true },
            { where }
        );

        if (updatedCount === 0) {
            throw new Error("Feature Facade not found");
        }

        return updatedCount;
    } catch (error) {
        throw error;
    }
}
