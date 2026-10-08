import Bull from "bull";
import { bullQueueOptions } from "../config/redisBull.config.js";

/**
 * Job name lives here, not in the processor: the processor imports the
 * company-onboarding service, so a service → processor import for this constant
 * would close a require cycle.
 */
export const SAMPLE_DATA_IMPORT_JOB = "sampleDataImport";

/**
 * Sample-data imports run here rather than on emailQueue/pdfQueue.
 *
 * A single import clones the whole demo dataset — hundreds of rows plus an S3
 * copy per image — and holds one long database transaction. On a shared queue
 * that would sit in front of outbound email for the duration; on its own queue
 * it can be slow without starving anything else.
 *
 * lockDuration is generous for the same reason: the default 30s window would
 * mark a healthy import as stalled and let Bull run it a second time.
 */
const sampleDataQueue = new Bull("sampleDataQueue", bullQueueOptions({
  settings: {
    lockDuration: 600000, // 10 min
    stalledInterval: 60000,
    maxStalledCount: 1,
  },
}));

export default sampleDataQueue;
