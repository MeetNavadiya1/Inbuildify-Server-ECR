import Bull from "bull";
import { bullQueueOptions } from "../config/redisBull.config.js";

/**
 * Time-driven Job Settings automations (Settings → Job → Settings).
 *
 * Currently carries one repeatable job — the daily auto-archive sweep that
 * moves jobs Completed longer than `auto_archive_after_days` ago to Archived.
 */
const jobAutomationQueue = new Bull("jobAutomationQueue", bullQueueOptions({
  settings: {
    lockDuration: 300000,
    stalledInterval: 60000,
    maxStalledCount: 1,
  },
}));

export default jobAutomationQueue;
