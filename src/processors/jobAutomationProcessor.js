import { runAutoArchiveSweep } from "../modules/job/job-automation.service.js";

export const AUTO_ARCHIVE_JOB = "autoArchiveJobs";

// Once a day at 01:00 server time. The sweep only moves Completed → Archived,
// so running it more or less often changes nothing but the archiving latency.
const AUTO_ARCHIVE_CRON = "0 1 * * *";

async function process() {
  const result = await runAutoArchiveSweep();
  console.log(
    `[JobAutomation] Auto-archive sweep: ${result.archived} job(s) archived across ${result.tenants} tenant(s).`,
  );
  return result;
}

export function register(queue) {
  queue.process(AUTO_ARCHIVE_JOB, process);

  queue.on("failed", (job, err) => {
    if (job.name !== AUTO_ARCHIVE_JOB) return;
    console.error(`[JobAutomation] Job ${job.id} failed:`, err.message);
  });

  console.log("Job automation worker started and listening for jobs...");
}

/**
 * Register the repeatable sweep. Bull keys repeatables on (name, cron, jobId),
 * so calling this from both the API and the worker process schedules exactly
 * one series — and whichever process is consuming the queue picks each tick up.
 */
export async function scheduleRecurring(queue) {
  try {
    await queue.add(
      AUTO_ARCHIVE_JOB,
      {},
      {
        repeat: { cron: AUTO_ARCHIVE_CRON },
        jobId: AUTO_ARCHIVE_JOB,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  } catch (error) {
    console.error("[JobAutomation] Could not schedule the auto-archive sweep:", error.message);
  }
}

export default { register, scheduleRecurring, AUTO_ARCHIVE_JOB };
