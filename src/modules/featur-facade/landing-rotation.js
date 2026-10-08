/**
 * Sharing a carousel position between facades that have equal claim to it.
 *
 * Order in the carousel is worth money, and the strip is ranked — promotions by
 * the position an admin gave them, fillers by how much the platform uses the
 * facade. Neither ranking is total: two promotions can sit on the same number,
 * and on usage whole runs of facades tie, most of them on nothing at all. Broken
 * by `created_at` alone, the same builder took the higher slot every hour of
 * every day, decided by nothing but who uploaded first.
 *
 * So a tie is a shared position, not a race. The day is cut into as many slices
 * as there are facades tied — two facades take twelve hours each, three take
 * eight, N take 24/N — and the run rotates by one place at every boundary, so
 * over a full day each of them holds every position in the run for an equal
 * stretch.
 *
 * What this never does is reorder the ranking. A rotation only ever moves a
 * facade within the run it already tied in: something ranked above a run is
 * above every member of it at every hour of the day, whichever of them is
 * currently on top.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Milliseconds since local midnight — a whole number, from 0 up to MS_PER_DAY.
 *
 * Whole milliseconds rather than a fraction of the day, and that is not a
 * detail. The obvious form of this is `elapsed / MS_PER_DAY`, then
 * `floor(fraction * size)` to pick the slice — which works in Javascript, where
 * the double nearest a third times three rounds back to exactly 1, and does not
 * in Postgres, where the same decimal handed to exact `numeric` arithmetic gives
 * 0.9999999999999999 and floors to the slice before. The order would then have
 * held its previous turn for the whole of the next one on every boundary that
 * does not divide cleanly. Multiplying first and dividing once keeps every step
 * in integers, where both languages agree.
 *
 * Local server time, so the boundaries land where the people running the site
 * would expect them to — a deployment moves them by setting `TZ`. Deliberately
 * not the visitor's clock: the order is computed once, cached, and served to
 * everybody, so it has to be one clock rather than each visitor's.
 */
export const dayMillis = (now = new Date()) =>
  now.getHours() * 3600000 +
  now.getMinutes() * 60000 +
  now.getSeconds() * 1000 +
  now.getMilliseconds();

/**
 * Which of a run's `size` slices the day is in, 0-based.
 *
 * `floor(elapsed * size / day)` is "how many whole 24/size-hour blocks have
 * passed": for three facades that is 0 before 08:00, 1 until 16:00, 2 until
 * midnight. The clamp guards a caller passing a full day's worth of
 * milliseconds, which the clock itself never reaches.
 */
export const rotationSlice = (size, millis = dayMillis()) => {
  if (!Number.isFinite(size) || size <= 1) return 0;
  return Math.min(size - 1, Math.max(0, Math.floor((millis * size) / MS_PER_DAY)));
};

/** Two priorities are the same position. Written out so `null` ties with `null`. */
const samePriority = (a, b) => Object.is(a ?? null, b ?? null);

/**
 * Rotate every run of equally-ranked items by where the day has got to.
 *
 * `items` must already be in ranked order, which is what makes a run of ties a
 * contiguous stretch — this walks them, and anything holding a rank on its own
 * is passed through untouched.
 *
 * Rotating left by the slice index is what produces the shift the schedule
 * describes: in the second slice of three, the run [A, B, C] is handed back as
 * [B, C, A], so B leads, and A — which led for the first eight hours — takes the
 * back of its own run rather than dropping out of it.
 *
 * @param {Array} items      ranked items, ties adjacent
 * @param {Function} priorityOf  the rank an item holds; equal ranks tie
 * @param {Date} now
 */
export const rotateTiedGroups = (items, priorityOf, now = new Date()) => {
  if (!Array.isArray(items) || items.length < 2) return items ?? [];

  const millis = dayMillis(now);
  const rotated = [];

  let start = 0;
  while (start < items.length) {
    let end = start + 1;
    while (end < items.length && samePriority(priorityOf(items[end]), priorityOf(items[start]))) {
      end += 1;
    }

    const size = end - start;
    const slice = rotationSlice(size, millis);

    for (let seat = 0; seat < size; seat += 1) {
      rotated.push(items[start + ((seat + slice) % size)]);
    }

    start = end;
  }

  return rotated;
};

/**
 * How long each facade in a run of `size` holds a position, in hours. Nothing
 * reads this to decide an order — it is what the admin console tells an admin
 * when it has to explain why the strip looks different from an hour ago.
 */
export const rotationIntervalHours = (size) => (size > 1 ? 24 / size : null);

/**
 * The calendar day a promotion starts on, in server-local time. `null` starts
 * — a promotion with no opening date — share a bucket of their own.
 *
 * Local rather than UTC to match `dayMillis`, and because the date a builder
 * picked in the modal was a local midnight before it was serialised. A server in
 * a different zone from its builders will read some of those a day off; that is
 * the same assumption the rest of this file already makes about `TZ`.
 */
export const startDayKey = (value) => {
  if (!value) return "none";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "none";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/** Ordinary ascending compare, for the string terms of the sort below. */
const compare = (a, b) => {
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

/**
 * What separates two promotions that start on the same day: nothing but usage.
 * A run sharing this key has no ranking left and takes turns instead.
 */
export const landingTieKey = ({ startDate, usage }) => `${startDayKey(startDate)}|${usage ?? 0}`;

/**
 * The carousel's running order for live promotions.
 *
 * Three rules, in this order:
 *
 *   1. Promotions starting on the same day are one group, and groups are ranked
 *      by the lowest `display_order` any of their members holds — so the admin's
 *      ordering still decides which day's intake leads.
 *   2. Inside a group, the facade the platform builds on most leads. This is the
 *      whole point: promotions that went up together have no ordering between
 *      them that anybody chose, and usage is a real reason to be first where
 *      "created a few seconds earlier" is not.
 *   3. What still ties — same start day, same usage — takes turns through the
 *      day rather than settling it by `created_at`.
 *
 * The group key is a sort term in its own right, after the group's rank. Two
 * groups could otherwise interleave on equal ranks, and `rotateTiedGroups` needs
 * every run of ties to be contiguous to find it.
 *
 * `read` maps an item to `{ startDate, displayOrder, usage, createdAt, id }`,
 * so the public feed and the admin strip — which name these fields differently —
 * can share the one definition of the order rather than each keeping a copy that
 * drifts from the other.
 */
export const orderLandingPromotions = (items, read, now = new Date()) => {
  if (!Array.isArray(items) || items.length < 2) return items ?? [];

  const fields = new Map(items.map((item) => [item, read(item)]));

  // The lowest number anybody in the group holds. Reading the group's rank off
  // its members rather than off the day itself is what keeps a hand-set order
  // meaningful: moving one promotion of a day's intake to the top moves that
  // whole day's intake with it, which is what the strip looks like it is doing.
  const rankOf = new Map();
  for (const item of items) {
    const { startDate, displayOrder } = fields.get(item);
    const key = startDayKey(startDate);
    const rank = Number.isFinite(displayOrder) ? displayOrder : Infinity;
    if (!rankOf.has(key) || rank < rankOf.get(key)) rankOf.set(key, rank);
  }

  const ordered = [...items].sort((a, b) => {
    const left = fields.get(a);
    const right = fields.get(b);
    const leftKey = startDayKey(left.startDate);
    const rightKey = startDayKey(right.startDate);

    return (
      rankOf.get(leftKey) - rankOf.get(rightKey) ||
      compare(leftKey, rightKey) ||
      (right.usage ?? 0) - (left.usage ?? 0) ||
      new Date(right.createdAt) - new Date(left.createdAt) ||
      compare(left.id, right.id)
    );
  });

  return rotateTiedGroups(ordered, (item) => landingTieKey(fields.get(item)), now);
};

export default {
  dayMillis,
  rotationSlice,
  rotateTiedGroups,
  rotationIntervalHours,
  startDayKey,
  landingTieKey,
  orderLandingPromotions,
  MS_PER_DAY,
};
