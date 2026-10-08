import db from "../config/database/models/postgre-models/index.js";
import {
  restoreCompanySampleData,
  syncCompanySampleData,
} from "../modules/company-onboarding/company-onboarding.service.js";
import {
  describeQueueFailure,
  startStuckImportSweep,
} from "../modules/company-onboarding/sample-data-reconciler.js";
import { SAMPLE_DATA_IMPORT_JOB } from "../queues/sampleDataQueue.js";
// import { describeDbError } from "../utils/describeDbError.js";

/**
 * Runs the sample-data import off the request thread.
 *
 * Cloning the demo dataset takes seconds to minutes — hundreds of inserts in one
 * transaction plus an S3 copy per image. Doing it inline made company onboarding
 * (and approving a request) hang for the whole duration, so both now enqueue
 * here and return immediately. The sample_data_request row carries the status
 * the UI polls: IMPORTING while this runs, then APPROVED or FAILED.
 *
 * Getting that last step right is the whole of the screen's honesty: the row is
 * all the UI can see, so a job that dies without writing FAILED back leaves a
 * builder watching a spinner that resolves to nothing. The events below cover
 * the failures this process witnesses; `sample-data-reconciler` covers the ones
 * that kill the process itself.
 */

/** Bull's own wording when it abandons a job for stalling. */
const STALLED_REASON = /stalled more than allowable limit/i;

function describeError(error) {
  const pg = error?.parent || error?.original;
  const parts = [
    error?.message,
    pg?.code && `[${pg.code}]`,
    pg?.table && `table=${pg.table}`,
    pg?.constraint && `constraint=${pg.constraint}`,
    pg?.column && `column=${pg.column}`,
    pg?.detail,
  ].filter(Boolean);

  return parts.join(" ").trim() || "Sample data import failed.";
}
async function markRequest(requestId, fields, { onlyWhileImporting = false } = {}) {
  if (!requestId) return;
  try {
    await db.SampleDataRequest.update(fields, {
      where: {
        sample_data_request_id: requestId,
        // Failure is written defensively: the reconciler may already have judged
        // this row, and a request the builder has since re-raised must not be
        // dragged back to FAILED by a late event from the job it replaced.
        // Success is written unconditionally — the import finishing is the last
        // word on it, whatever anything else concluded in the meantime.
        ...(onlyWhileImporting ? { status: "IMPORTING" } : {}),
      },
    });
  } catch (error) {
    console.error(
      `[SampleDataImportWorker] Could not update request ${requestId}:`,
      error.message,
    );
  }
}

/**
 * Has Bull finished with this job, or is another attempt still coming?
 *
 * `attemptsMade >= opts.attempts` is the obvious test and it is not enough on
 * its own. Bull increments `attemptsMade` inside `moveToFailed`, which only the
 * processing path calls — a job abandoned for stalling is moved into the failed
 * set by `moveStalledJobsToWait` in Lua, which never touches the counter. So a
 * stalled import arrives here with attemptsMade below the limit, the arithmetic
 * says "a retry is coming", no retry is coming, and the request row is left on
 * IMPORTING for good while the queue plainly shows the job as failed.
 *
 * `finishedOn` is the signal that covers both: `moveToFailed` sets it on the
 * instance when it gives up, and the stalled script writes it to the job hash,
 * so a job read back from Redis carries it too. It is absent while a retry is
 * pending, which is the case that must stay on IMPORTING.
 */
function bullHasGivenUp(job) {
  if (job.finishedOn) return true;
  if (STALLED_REASON.test(String(job.failedReason || ""))) return true;

  const attempts = Number(job.opts?.attempts) || 1;
  const made = Number(job.attemptsMade) || 0;

  // made === 0 means nothing incremented the counter, which is the stalled path
  // again — treat it as final rather than waiting for a retry that has no one
  // left to schedule it.
  return made === 0 || made >= attempts;
}

export function register(queue) {
  queue.process(SAMPLE_DATA_IMPORT_JOB, async (job) => {
    const { companyId, builderId, userId, requestId, mode } = job.data;
    // SYNC tops the existing sample data up with whatever the demo account has
    // gained; RESTORE (the default, and what an approved request enqueues)
    // clears what is there and re-imports the lot.
    const isSync = mode === "SYNC";

    console.log(
      `[SampleDataImportWorker] ${isSync ? "Syncing" : "Importing"} sample data for company ${companyId}`,
    );

    // What the Settings screen's progress bar reads.
    //
    // Written outside the import's transaction on purpose: the clone holds one
    // long transaction, so a progress write enqueued inside it would stay
    // invisible until the commit that ends the job — which is exactly when the
    // number stops being useful. `onlyWhileImporting` keeps a late write from
    // touching a row the reconciler has already given up on.
    const reportProgress = (percent) =>
      markRequest(requestId, { progress: percent }, { onlyWhileImporting: true });

    if (isSync) {
      await syncCompanySampleData(companyId, builderId, userId, reportProgress);
    } else {
      await restoreCompanySampleData(companyId, builderId, userId, reportProgress);
    }

    await markRequest(requestId, {
      status: "APPROVED",
      error_message: null,
      progress: 100,
    });

    console.log(
      `[SampleDataImportWorker] Sample data ready for company ${companyId}`,
    );
    return { success: true, companyId, mode: isSync ? "SYNC" : "RESTORE" };
  });

  queue.on("failed", async (job, err) => {
    // `job` is null when Bull emits this from its stalled sweep for a job whose
    // hash has already been trimmed away by removeOnFail. Reading `.name` off it
    // rejects this listener, and worker.js turns an unhandled rejection into
    // process.exit — so one lost job took the whole worker, and every other
    // queued import with it.
    try {
      if (job?.name !== SAMPLE_DATA_IMPORT_JOB) return;

      const reason = describeQueueFailure(describeError(err));
      console.error(
        `[SampleDataImportWorker] Job ${job.id} failed for company ${job.data?.companyId} ` +
          `(attempt ${job.attemptsMade || "?"} of ${job.opts?.attempts ?? 1}):`,
        reason,
      );
      // The stack points at the row that was being cloned, which is what tells you
      // WHICH clone step is at fault — the reason alone does not.
      if (err?.stack) console.error(err.stack);

      // A failure with a retry still to come leaves the request on IMPORTING —
      // it genuinely is. Anything Bull has finished with is reported, so the
      // screen stops spinning and says what went wrong.
      if (!bullHasGivenUp(job)) return;

      await markRequest(
        job.data?.requestId,
        { status: "FAILED", error_message: reason.slice(0, 500) },
        { onlyWhileImporting: true },
      );
    } catch (handlerError) {
      console.error(
        "[SampleDataImportWorker] Failure handler error:",
        handlerError?.message || handlerError,
      );
    }
  });

  // A stalled job is going back to the queue for another run, so the row stays
  // on IMPORTING — but it is worth saying so, because a repeatedly stalling
  // import is a worker being killed mid-clone, not a bad dataset.
  queue.on("stalled", (job) => {
    if (job?.name !== SAMPLE_DATA_IMPORT_JOB) return;
    console.warn(
      `[SampleDataImportWorker] Job ${job.id} stalled for company ${job.data?.companyId} — requeued.`,
    );
  });

  queue.on("completed", (job, result) => {
    if (job?.name !== SAMPLE_DATA_IMPORT_JOB) return;
    console.log(`[SampleDataImportWorker] Job ${job.id} completed:`, result);
  });

  // The events above only fire in the process that ran the job. Nothing fires at
  // all when that process dies mid-import, which is the most common way one of
  // these ends — so the rows are also reconciled against the queue on a timer.
  startStuckImportSweep();

  console.log("Sample data import worker started on sampleDataQueue...");
}
