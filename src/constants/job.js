/**
 * Job.status is a free-text column (see job.model.js) with no enum constraint.
 * These constants centralize the values other modules react to.
 *
 * - HANDOVER_COMPLETED: set via PATCH /job/:job_id/status, JobService
 *   .updateJobStatus auto-creates that job's Maintenance record.
 * - COMPLETED / ARCHIVED: driven by Settings → Job → Settings
 *   (`job_settings.auto_mark_completed` / `auto_archive_after_completion`).
 *   See job-automation.service.js.
 */
export const JOB_STATUS_HANDOVER_COMPLETED = "Handover Completed";
export const JOB_STATUS_IN_PROGRESS = "In Progress";
export const JOB_STATUS_COMPLETED = "Completed";
export const JOB_STATUS_ON_HOLD = "On Hold";
export const JOB_STATUS_CANCELLED = "Cancelled";
export const JOB_STATUS_ARCHIVED = "Archived";

/**
 * The job-process stage that hands a job over to maintenance.
 *
 * This is POST-construction, not construction: the job only moves to
 * maintenance once the post-construction work (handover, PCI, defects) is done,
 * which is the stage that sits immediately before Maintenance in the seeded
 * job process. Matched on the stage's functionality name first (seeded as
 * "Post-Construction Workflow"), falling back to the stage name for builders
 * who renamed or rebuilt their stage list.
 */
export const POST_CONSTRUCTION_STAGE_FUNCTIONALITY = "Post-Construction Workflow";
export const POST_CONSTRUCTION_STAGE_NAME = "Postconstruction";
