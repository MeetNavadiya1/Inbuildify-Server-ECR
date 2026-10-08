/**
 * Bring `sample_data_request` rows stuck on IMPORTING back in line with what the
 * queue actually holds.
 *
 * The row is the only thing the Settings → Sample Data screen can see: the
 * import runs on a worker, so the UI polls this row and shows a spinner for as
 * long as it says IMPORTING. That is correct while the job is alive and wrong
 * the moment it is not — and there are three ways a job dies without anything
 * writing FAILED back to the row:
 *
 *   1. The job stalls. Bull's stalled sweep moves it straight into the failed
 *      set from Lua (`moveStalledJobsToWait`) without touching `attemptsMade`,
 *      so a processor deciding "has Bull given up?" from the attempt count alone
 *      never sees it. Bull Board shows the job failed; the row still says
 *      IMPORTING.
 *   2. The worker process dies mid-import — OOM, a container restart, a deploy.
 *      No `failed` event is ever emitted, by anybody, because the process that
 *      would have emitted it is gone.
 *   3. Redis loses the job — flushed, evicted, or trimmed away by
 *      `removeOnFail` before anything read it.
 *
 * In all three the builder is left watching a spinner that will never resolve,
 * and — worse — cannot ask again, because every entry point refuses a second
 * request while one is IMPORTING.
 *
 * So the row is reconciled against the queue instead of trusting an event to
 * arrive. This runs on a timer in the worker AND on the API's read path, which
 * is deliberate: case 2 is precisely the case where no worker is running, and
 * the only process left able to rescue the row is the one serving the poll.
 */

import { Op } from "sequelize";

import db from "../../config/database/models/postgre-models/index.js";
import sampleDataQueue, {
  SAMPLE_DATA_IMPORT_JOB,
} from "../../queues/sampleDataQueue.js";

const IMPORTING = "IMPORTING";
const FAILED = "FAILED";

/**
 * Queue states an import can still legitimately be sitting in.
 *
 * `delayed` is in the list because that is where a job waits out its backoff
 * between attempts — a first failure with a retry to come must keep the row on
 * IMPORTING, which is the one case the old processor got right.
 */
const LIVE_STATES = ["waiting", "active", "delayed", "paused"];

/**
 * How long a row has to have sat on IMPORTING before it is worth judging.
 *
 * Covers the gap between the row being written and `queue.add()` landing — they
 * are consecutive statements, so it is milliseconds — plus any clock skew
 * between the API and the database. Nothing here is time-critical: the UI polls
 * every five seconds, so a minute's grace costs a builder one extra spinner.
 */
const STALE_AFTER_MS = 60_000;

/**
 * The ceiling past which an import is called dead regardless of the queue.
 *
 * The queue is not always the last word. A job left in the `active` list by a
 * worker that never came back looks alive to `getJobs` — the stalled sweep that
 * would rescue it only runs inside a worker, and there is not one. Without a
 * ceiling that row spins forever.
 *
 * Generous on purpose: the clone takes seconds to minutes, `lockDuration` allows
 * ten, and two attempts with backoff can legitimately stretch past twenty. A
 * late success still corrects the row — the processor writes APPROVED
 * unconditionally — so the cost of being wrong here is a banner that briefly
 * said failed, not lost work.
 */
const HARD_TIMEOUT_MS = 45 * 60_000;

/** How often the worker re-checks. Cheap: two Redis reads and one indexed query. */
const SWEEP_INTERVAL_MS = 2 * 60_000;

const WORKER_LOST_MESSAGE =
  "The import stopped before it finished — the background worker was restarted " +
  "or interrupted, and the job is no longer queued. Nothing will happen on its " +
  "own; request sample data again to retry.";

const STALLED_MESSAGE =
  "The import stopped responding and was abandoned after the allowed number of " +
  "retries. Request sample data again to retry.";

const TIMED_OUT_MESSAGE =
  "The import has been running far longer than one should take and has been " +
  "given up on. Request sample data again to retry.";

const GENERIC_FAILURE_MESSAGE =
  "The import failed. Request sample data again to retry.";

/** Bull's own wording when a job is abandoned for stalling. */
const STALLED_REASON = /stalled more than allowable limit/i;

/**
 * Turn a dead job's failure reason into one sentence a builder can act on.
 *
 * Bull's internal wording ("job stalled more than allowable limit") describes
 * the queue, not the import, and means nothing on a Settings screen. A reason
 * raised by the importer itself is passed through — that one names the record
 * that would not clone, which is the useful half.
 */
export function describeQueueFailure(reason) {
  const text = String(reason || "").trim();
  if (!text) return GENERIC_FAILURE_MESSAGE;
  if (STALLED_REASON.test(text)) return STALLED_MESSAGE;
  return text;
}

const isImportJob = (job) =>
  Boolean(job) && job.name === SAMPLE_DATA_IMPORT_JOB && Boolean(job.data?.requestId);

/**
 * Snapshot the queue as two lookups keyed by request: what is still going, and
 * what has already died.
 *
 * `getJobs` resolves a removed job to null, so every read is filtered before
 * being indexed.
 */
async function readQueue() {
  const [liveJobs, failedJobs] = await Promise.all([
    sampleDataQueue.getJobs(LIVE_STATES),
    sampleDataQueue.getJobs(["failed"]),
  ]);

  const live = new Set();
  for (const job of liveJobs) {
    if (isImportJob(job)) live.add(job.data.requestId);
  }

  const failed = new Map();
  for (const job of failedJobs) {
    if (isImportJob(job)) failed.set(job.data.requestId, job);
  }

  return { live, failed };
}

/**
 * Judge every request row still claiming to be importing, and fail the ones
 * nothing is working on.
 *
 * Rows are read before the queue, deliberately. A job that finishes between the
 * two reads has already written APPROVED to its row — the processor marks the
 * row and only then completes — so the guarded update below matches nothing and
 * a success is never overwritten with a failure.
 *
 * @param {object}   [options]
 * @param {string[]} [options.requestIds] limit to these rows; omit for all
 * @param {number}   [options.graceMs]    ignore rows younger than this
 * @returns {Promise<{ checked: number, failed: number }>}
 */
export async function reconcileStuckSampleDataImports(options = {}) {
  const {
    requestIds = null,
    graceMs = STALE_AFTER_MS,
    hardTimeoutMs = HARD_TIMEOUT_MS,
  } = options;

  if (requestIds && requestIds.length === 0) return { checked: 0, failed: 0 };

  // The worker starts its sweep as soon as the processor registers, and a caller
  // that registers before `initModels()` has finished would otherwise get a
  // `findAll of undefined` out of a background timer — a confusing way to learn
  // about a startup ordering problem. There is nothing to reconcile until the
  // models exist, so wait for the next tick rather than throwing.
  if (!db?.SampleDataRequest) return { checked: 0, failed: 0 };

  const cutoff = new Date(Date.now() - graceMs);

  const stuck = await db.SampleDataRequest.findAll({
    where: {
      status: IMPORTING,
      updated_at: { [Op.lt]: cutoff },
      ...(requestIds ? { sample_data_request_id: { [Op.in]: requestIds } } : {}),
    },
    // `updated_at` is declared on the model and also managed by Sequelize's own
    // timestamps, so both spellings can come back — the same hedge the request
    // serialiser makes for `created_at`.
    attributes: ["sample_data_request_id", "updated_at", "created_at", "company_id"],
  });

  if (stuck.length === 0) return { checked: 0, failed: 0 };

  let queue = null;
  try {
    queue = await readQueue();
  } catch (error) {
    // Redis unreachable. A running import and a lost one look identical from
    // here, and calling a live import failed is the worse mistake of the two —
    // so only the hard timeout applies until Redis answers again.
    console.error(
      "[SampleDataReconciler] Could not read the queue:",
      error?.message || error,
    );
  }

  let failed = 0;

  for (const row of stuck) {
    const requestId = row.sample_data_request_id;
    const startedAt = new Date(
      row.updated_at || row.updatedAt || row.created_at || row.createdAt,
    ).getTime();
    const ageMs = Number.isNaN(startedAt) ? 0 : Date.now() - startedAt;

    let reason = null;

    if (queue) {
      const deadJob = queue.failed.get(requestId);
      if (deadJob) {
        reason = describeQueueFailure(deadJob.failedReason);
      } else if (!queue.live.has(requestId)) {
        reason = WORKER_LOST_MESSAGE;
      }
    }

    // Still listed as live (or Redis is down), but far too old to believe.
    if (!reason && ageMs > hardTimeoutMs) reason = TIMED_OUT_MESSAGE;

    if (!reason) continue;

    // Guarded on IMPORTING: the worker may have written the real outcome in the
    // time this loop took, and it is the authority — this is only the fallback.
    const [updated] = await db.SampleDataRequest.update(
      { status: FAILED, error_message: reason.slice(0, 500) },
      { where: { sample_data_request_id: requestId, status: IMPORTING } },
    );

    if (updated > 0) {
      failed += 1;
      console.warn(
        `[SampleDataReconciler] Request ${requestId} (company ${row.company_id}) ` +
          `was stuck on IMPORTING and has been marked FAILED: ${reason}`,
      );
    }
  }

  return { checked: stuck.length, failed };
}

/**
 * When each request was last judged, so the screen polling every five seconds
 * does not re-read the queue every five seconds.
 *
 * Only ever holds requests seen mid-import, so it is bounded by how many are in
 * flight at once — and dropped wholesale if that assumption is ever wrong, which
 * costs one extra queue read rather than a leak.
 */
const lastCheckedAt = new Map();

/**
 * Reconcile before reading or before refusing a new request.
 *
 * Swallows its own errors: every caller is on a path whose real job is something
 * else — showing the Settings screen, taking a new request — and a reconcile
 * that cannot reach Redis must not take that down with it. The worst case is the
 * row staying IMPORTING until the next sweep, which is where it already was.
 *
 * @param {number} [options.throttleMs] skip if this request was judged that
 *   recently. For the poll, which asks constantly and can afford to wait. Never
 *   for the path deciding whether to refuse a new request — making somebody ask
 *   twice because their first ask arrived inside a throttle window is exactly
 *   the lockout this is here to end.
 */
export async function reconcileSampleDataRequestsQuietly(requestIds, options = {}) {
  const { throttleMs = 0 } = options;

  try {
    const ids = (Array.isArray(requestIds) ? requestIds : [requestIds]).filter(Boolean);
    if (ids.length === 0) return 0;

    let due = ids;
    if (throttleMs > 0) {
      const now = Date.now();
      due = ids.filter((id) => now - (lastCheckedAt.get(id) || 0) >= throttleMs);
      if (due.length === 0) return 0;

      if (lastCheckedAt.size > 500) lastCheckedAt.clear();
      for (const id of due) lastCheckedAt.set(id, now);
    }

    const { failed } = await reconcileStuckSampleDataImports({ requestIds: due });
    return failed;
  } catch (error) {
    console.error(
      "[SampleDataReconciler] Reconcile skipped:",
      error?.message || error,
    );
    return 0;
  }
}

/**
 * Start the worker's periodic sweep.
 *
 * Runs once on start before settling into the interval: a worker coming up is
 * very often a worker that just went down mid-import, and the rows it orphaned
 * are exactly what this exists to clear. Anything genuinely still queued is in
 * the queue snapshot and is left alone.
 *
 * The timer is unref'd so it never holds the process open on shutdown.
 */
export function startStuckImportSweep(intervalMs = SWEEP_INTERVAL_MS) {
  const sweep = async () => {
    try {
      const { checked, failed } = await reconcileStuckSampleDataImports();
      if (failed > 0) {
        console.warn(
          `[SampleDataReconciler] Swept ${checked} stuck request(s); ${failed} marked FAILED.`,
        );
      }
    } catch (error) {
      console.error(
        "[SampleDataReconciler] Sweep failed:",
        error?.message || error,
      );
    }
  };

  sweep();

  const timer = setInterval(sweep, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

export default {
  reconcileStuckSampleDataImports,
  reconcileSampleDataRequestsQuietly,
  startStuckImportSweep,
  describeQueueFailure,
};
