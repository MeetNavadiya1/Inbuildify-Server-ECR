import jobAutomationQueue from "../queues/jobAutomationQueue.js";
import { register, scheduleRecurring } from "../processors/jobAutomationProcessor.js";

/**
 * API-process half of the Job Settings auto-archive sweep.
 *
 * The processor itself lives in src/processors so worker.js can run it too;
 * importing this module (from server.js) both registers the consumer and
 * schedules the repeatable job, so the sweep still runs on deployments that
 * only start the API process.
 */
register(jobAutomationQueue);
scheduleRecurring(jobAutomationQueue);

export default jobAutomationQueue;
