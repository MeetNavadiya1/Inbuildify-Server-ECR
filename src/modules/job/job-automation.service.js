import { Op, QueryTypes } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import maintenanceService from "../maintenance/maintenance.service.js";
import { logJobActivity } from "../../utils/jobActivityLogger.js";
import {
  JOB_STATUS_COMPLETED,
  JOB_STATUS_ARCHIVED,
  JOB_STATUS_CANCELLED,
  POST_CONSTRUCTION_STAGE_FUNCTIONALITY,
  POST_CONSTRUCTION_STAGE_NAME,
} from "../../constants/job.js";

/**
 * Settings → Job → Settings, applied to jobs.
 *
 * The `job_settings` row is per builder/company and holds three lifecycle
 * automations that the rest of the app never consulted:
 *
 *   auto_move_to_maintenance      — create the job's Maintenance record as soon
 *                                   as its POST-construction stage is finished
 *                                   (the last stage before Maintenance), not
 *                                   the Construction stage itself.
 *   auto_mark_completed           — set the job's status to "Completed" once
 *                                   every activity in the FINAL job-process
 *                                   stage is done.
 *   auto_archive_after_completion — flip a Completed job to "Archived" once
 *                                   `auto_archive_after_days` have passed.
 *                                   (+ auto_archive_after_days)
 *
 * The first two are evaluated event-driven, right after a workflow task or
 * sub-stage changes (see the hooks in job-process-task.service.js /
 * job-process-stage.service.js). The third is time-driven and runs from the
 * daily sweep (jobAutomationProcessor.js).
 *
 * Everything here is idempotent and best-effort: an automation failure must
 * never fail the user's task update, so callers wrap the entry points in
 * try/catch and this module logs rather than throws where it can.
 */

// A workflow stage is "done" when it has at least one active (synced)
// sub-stage and every one of them is completed or explicitly skipped.
const STAGE_PROGRESS_SQL = `
  SELECT jps.stage_id,
         jps.name        AS stage_name,
         jps.sort_order  AS stage_order,
         func.name       AS functionality_name,
         COUNT(*)::int                                                          AS total,
         COUNT(*) FILTER (WHERE jss.is_completed OR jss.is_skipped)::int        AS closed
    FROM job_sub_stage jss
    JOIN job_process_stage jps ON jps.stage_id = jss.stage_id
    JOIN job_process_stage_functionality func ON func.functionality_id = jps.functionality_id
   WHERE jss.job_id = :jobId
     AND jss.is_synced = true
     AND func.is_workflow = true
   GROUP BY jps.stage_id, jps.name, jps.sort_order, func.name
   ORDER BY jps.sort_order ASC`;

/**
 * The job's active workflow stages with a derived `isComplete` flag, in
 * job-process order. Stages the job has un-synced (excluded from its workflow)
 * never appear, so the "final stage" is the last stage this job actually runs.
 */
export async function getJobStageProgress(jobId, transaction = null) {
  const rows = await db.sequelize.query(STAGE_PROGRESS_SQL, {
    replacements: { jobId },
    type: QueryTypes.SELECT,
    transaction,
  });

  return rows.map((r) => ({
    stageId: r.stage_id,
    stageName: r.stage_name,
    stageOrder: r.stage_order,
    functionalityName: r.functionality_name,
    total: r.total,
    closed: r.closed,
    isComplete: r.total > 0 && r.closed === r.total,
  }));
}

function isPostConstructionStage(stage) {
  return (
    stage.functionalityName === POST_CONSTRUCTION_STAGE_FUNCTIONALITY ||
    stage.stageName?.trim().toLowerCase() === POST_CONSTRUCTION_STAGE_NAME.toLowerCase()
  );
}

/**
 * The job_settings row for a tenant. Returns null when the builder/company has
 * never opened Settings → Job (the row is created lazily on first read there),
 * in which case every automation is off.
 */
export async function getJobSettings({ builderId, companyId }, transaction = null) {
  if (!builderId && !companyId) return null;

  return await db.JobSettings.findOne({
    where: {
      [Op.or]: [
        { builder_id: builderId || null },
        { company_id: companyId || null },
      ],
    },
    transaction,
  });
}

/**
 * Evaluate the event-driven automations for one job.
 *
 * Call this AFTER the transaction that changed the workflow has committed —
 * it re-reads the job's stage progress and may create a Maintenance record,
 * which runs in its own transaction.
 *
 * @returns {Promise<{movedToMaintenance: boolean, markedCompleted: boolean}>}
 */
export async function evaluateJobAutomation(jobId, { user = null } = {}) {
  const result = { movedToMaintenance: false, markedCompleted: false };
  if (!jobId) return result;

  const { Job } = db.sequelize.models;
  const job = await Job.findByPk(jobId);
  if (!job) return result;

  // Cancelled/archived jobs are terminal — no automation reopens them.
  if (job.status === JOB_STATUS_ARCHIVED || job.status === JOB_STATUS_CANCELLED) {
    return result;
  }

  const settings = await getJobSettings({
    builderId: job.builder_id,
    companyId: job.company_id,
  });

  if (!settings || (!settings.auto_move_to_maintenance && !settings.auto_mark_completed)) {
    return result;
  }

  const stages = await getJobStageProgress(jobId);
  if (!stages.length) return result;

  // ── Move to maintenance when post-construction finishes ─────────────────
  // The setting reads "when the Construction is Completed", but the handover to
  // maintenance belongs at the END of the construction phase — i.e. once the
  // Postconstruction stage (handover / PCI / defects) is done, which is the
  // stage that sits immediately before Maintenance in the job process.
  if (settings.auto_move_to_maintenance) {
    const postConstruction = stages.find(isPostConstructionStage);

    if (postConstruction?.isComplete) {
      const maintenance = await maintenanceService.ensureMaintenanceForJob(
        jobId,
        {
          builderId: job.builder_id,
          companyId: job.company_id,
          supervisorId: job.supervisor_id,
          customerContactId: job.customer_contact_id,
        },
        user || {},
      );

      if (maintenance?.created) {
        result.movedToMaintenance = true;
        await logJobActivity(null, {
          userId: user?.users_id || user?.user_id || null,
          jobId,
          module: "Job",
          moduleId: jobId,
          recordName: job.reference_number,
          action: "UPDATE",
          description:
            `Moved to Maintenance automatically — the ${postConstruction.stageName} stage is complete (Settings → Job → Settings)`,
        });
      }
    }
  }

  // ── Mark completed when the final stage finishes ────────────────────────
  if (settings.auto_mark_completed && job.status !== JOB_STATUS_COMPLETED) {
    const finalStage = stages[stages.length - 1];

    if (finalStage?.isComplete) {
      const oldStatus = job.status;
      await job.update({ status: JOB_STATUS_COMPLETED, completed_at: new Date() });
      result.markedCompleted = true;

      await logJobActivity(null, {
        userId: user?.users_id || user?.user_id || null,
        jobId,
        module: "Job",
        moduleId: jobId,
        recordName: job.reference_number,
        action: "UPDATE",
        fieldName: "status",
        oldValue: oldStatus,
        newValue: JOB_STATUS_COMPLETED,
        description: `Marked Completed automatically — every activity in the final stage (${finalStage.stageName}) is done (Settings → Job → Settings)`,
      });
    }
  }

  return result;
}

/**
 * Same as evaluateJobAutomation but swallows its own errors — the form the
 * workflow hooks use, so a broken automation can never fail a task update.
 */
export async function evaluateJobAutomationSafely(jobId, options = {}) {
  try {
    return await evaluateJobAutomation(jobId, options);
  } catch (error) {
    console.error(`[JobAutomation] Failed to evaluate job ${jobId}:`, error);
    return { movedToMaintenance: false, markedCompleted: false };
  }
}

/**
 * Time-driven half: archive jobs that have been Completed for longer than the
 * tenant's configured window. Runs from the daily sweep and is safe to run as
 * often as you like — it only ever moves Completed → Archived.
 *
 * @returns {Promise<{tenants: number, archived: number}>}
 */
export async function runAutoArchiveSweep() {
  const { Job } = db.sequelize.models;

  const tenants = await db.JobSettings.findAll({
    where: {
      auto_archive_after_completion: true,
      auto_archive_after_days: { [Op.ne]: null },
    },
  });

  let archived = 0;

  for (const settings of tenants) {
    const days = Number(settings.auto_archive_after_days);
    if (!Number.isFinite(days) || days < 0) continue;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const tenantScope = [];
    if (settings.builder_id) tenantScope.push({ builder_id: settings.builder_id });
    if (settings.company_id) tenantScope.push({ company_id: settings.company_id });
    if (!tenantScope.length) continue;

    const due = await Job.findAll({
      where: {
        status: JOB_STATUS_COMPLETED,
        completed_at: { [Op.ne]: null, [Op.lte]: cutoff },
        [Op.or]: tenantScope,
      },
    });

    for (const job of due) {
      await job.update({ status: JOB_STATUS_ARCHIVED, archived_at: new Date() });
      archived += 1;

      await logJobActivity(null, {
        userId: null,
        jobId: job.job_id,
        module: "Job",
        moduleId: job.job_id,
        recordName: job.reference_number,
        action: "UPDATE",
        fieldName: "status",
        oldValue: JOB_STATUS_COMPLETED,
        newValue: JOB_STATUS_ARCHIVED,
        description: `Archived automatically — completed more than ${days} day(s) ago (Settings → Job → Settings)`,
      });
    }
  }

  return { tenants: tenants.length, archived };
}

export default {
  getJobSettings,
  getJobStageProgress,
  evaluateJobAutomation,
  evaluateJobAutomationSafely,
  runAutoArchiveSweep,
};
