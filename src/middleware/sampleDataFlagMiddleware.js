import {
  runWithoutSampleData,
  withSampleDataFlag,
} from "../config/database/models/postgre-models/sampleDataFlag.js";

/** Accepted spellings: this runs before the per-router camelCase→snake_case pass. */
const asksToExclude = (query) =>
  String(query?.excludeSampleData ?? query?.exclude_sample_data ?? "").toLowerCase() === "true";

/**
 * Two jobs, both about telling seeded demo rows apart from real ones.
 *
 * 1. Stamp `isSampleData` onto plain rows on their way out. The model layer
 *    already covers anything serialised through Sequelize's `toJSON`; it cannot
 *    cover the two cases that never build an instance — a `raw: true` query and
 *    a service handing back `get({ plain: true })`. Those arrive here as
 *    ordinary objects still carrying `is_sample_data`.
 *
 *    Model instances are deliberately left alone: they are still instances at
 *    this point and `JSON.stringify` calls their own stamped `toJSON` a moment
 *    later, so stamping here would just duplicate the walk.
 *
 * 2. Honour `?excludeSampleData=true` by running the request with seeded rows
 *    filtered out of every find. This is what a picker on a "create new" form
 *    asks for. It is opt-in per request precisely because the same endpoints
 *    also feed the Settings screens, which must keep showing the demo rows in
 *    order to badge and clear them.
 *
 * Wrapping `res.json` rather than `successResponse` catches the handful of
 * controllers that answer with `res.json` directly.
 */
const sampleDataFlagMiddleware = (req, res, next) => {
  const json = res.json.bind(res);

  res.json = (payload) => json(withSampleDataFlag(payload));

  if (asksToExclude(req.query)) return runWithoutSampleData(next);

  return next();
};

export default sampleDataFlagMiddleware;
