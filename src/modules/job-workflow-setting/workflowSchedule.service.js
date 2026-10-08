/**
 * WORKFLOW SCHEDULE SERVICE
 *
 * Turns the five Job → Workflow settings (Settings → Job → Workflow) into actual
 * behaviour on a job's workflow.
 *
 * A job's workflow is one continuous chain of tasks. Every `job_process_stage`
 * whose functionality is a workflow one — Pre-Construction Workflow,
 * Construction Workflow, Post-Construction Workflow and the generic WorkFlow —
 * contributes its sub-stages and tasks, and they are walked in
 * (stage.sort_order, sub_stage.sort_order, task.sort_order) order. So a single
 * pass schedules all three workflows, and construction tasks naturally start
 * after pre-construction ones finish.
 *
 * Each setting maps onto the walk as follows:
 *
 *   include_weekend_date
 *     ON  — Saturdays/Sundays count towards a task's duration (calendar days).
 *     OFF — they are skipped, so the end date is pushed out.
 *
 *   include_holiday_date
 *     ON  — company holidays count towards a task's duration.
 *     OFF — they are skipped, pushing the end date out. A holiday that falls on
 *           a weekend is treated as a holiday even when weekends are on, which
 *           is why the holiday test runs first in `isWorkingDay`.
 *
 *   recalculate_estimated_end_dates_future_tasks
 *     ON  — a hand-edited estimated end date moves every later task with it.
 *     OFF — the edit is confined to its own task; the chain carries on from the
 *           duration-derived end date instead.
 *
 *   recalculate_estimated_dates_based_on_actual_changes
 *     ON  — recording an actual date immediately re-bases the rest of the chain
 *           on it (`actual_date_applied` is set as the date is recorded).
 *     OFF — the shift is only applied once the user confirms it, which is what
 *           sets `actual_date_applied`. Until then the chain stays on estimates.
 *
 *   show_all_tasks_to_all_roles
 *     ON  — everybody sees every task.
 *     OFF — an operational role only sees tasks assigned to their role, plus
 *           unassigned ones and ones they created themselves. Administrators
 *           (tiers 1–2) always see the whole workflow (see
 *           `filterTasksForViewer`).
 *
 * Because the whole schedule is derived, it is recomputed on read as well as on
 * write: flipping a setting, adding a holiday or editing a duration shows up on
 * the next load without a migration-style sweep over every job.
 */
import db from "../../config/database/models/postgre-models/index.js";
import { managesWorkflow } from "../../constants/rbac.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Hard stop for the day-by-day walks, so bad data can never spin forever. */
const MAX_DAY_STEPS = 20000;

export const DEFAULT_WORKFLOW_SETTINGS = Object.freeze({
  show_all_tasks_to_all_roles: false,
  include_weekend_date: false,
  include_holiday_date: false,
  recalculate_estimated_end_dates_future_tasks: false,
  recalculate_estimated_dates_based_on_actual_changes: false,
});

/* =========================================================
   DATE HELPERS

   Everything is done on UTC midnight Dates so a server timezone can never
   shift a business date by a day. DATEONLY columns come back as
   "YYYY-MM-DD" strings; timestamps come back as Date objects.
========================================================= */

export function toUtcDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateString(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Expand holiday rows (which are start/end ranges) into a set of "YYYY-MM-DD"
 * keys. Ranges are capped so one bad row cannot blow up memory.
 */
function buildHolidaySet(holidays) {
  const set = new Set();

  for (const holiday of holidays || []) {
    const start = toUtcDate(holiday.holiday_start_date);
    if (!start) continue;

    const end = toUtcDate(holiday.holiday_end_date) || start;

    let cursor = start;
    let steps = 0;
    while (cursor.getTime() <= end.getTime() && steps < 400) {
      set.add(toDateString(cursor));
      cursor = addDays(cursor, 1);
      steps += 1;
    }
  }

  return set;
}

/**
 * Working-day calendar for a tenant, driven by the weekend/holiday settings.
 */
export function createWorkingCalendar(settings, holidays) {
  const includeWeekend = !!settings.include_weekend_date;
  const includeHoliday = !!settings.include_holiday_date;
  const holidaySet = includeHoliday ? new Set() : buildHolidaySet(holidays);

  const isWorkingDay = (date) => {
    // Holidays are tested first: a holiday landing on a weekend counts as a
    // holiday even when weekends are switched on.
    if (!includeHoliday && holidaySet.has(toDateString(date))) return false;
    if (!includeWeekend && isWeekend(date)) return false;
    return true;
  };

  const nextWorkingDay = (date) => {
    let cursor = date;
    let steps = 0;
    while (!isWorkingDay(cursor) && steps < MAX_DAY_STEPS) {
      cursor = addDays(cursor, 1);
      steps += 1;
    }
    return cursor;
  };

  /**
   * End date of a task that starts on `start` and runs for `days` working days.
   * The start day itself is the first of those days, so a 1-day task ends the
   * day it starts.
   */
  const endOfDuration = (start, days) => {
    let cursor = nextWorkingDay(start);
    let remaining = Math.max(1, Number(days) || 1);
    let steps = 0;

    while (remaining > 1 && steps < MAX_DAY_STEPS) {
      cursor = nextWorkingDay(addDays(cursor, 1));
      remaining -= 1;
      steps += 1;
    }

    return cursor;
  };

  return { isWorkingDay, nextWorkingDay, endOfDuration, dayAfter: (date) => nextWorkingDay(addDays(date, 1)) };
}

/* =========================================================
   SETTINGS + HOLIDAYS
========================================================= */

/**
 * Read a tenant's workflow settings. Falls back to the model defaults when the
 * row has not been created yet, so the schedule never depends on the settings
 * page having been opened.
 */
export async function getWorkflowSettings({ builderId, companyId }) {
  const { JobWorkflowSettings } = db;

  const record = await JobWorkflowSettings.findOne({
    where: { builder_id: builderId ?? null, company_id: companyId ?? null },
  });

  if (!record) return { ...DEFAULT_WORKFLOW_SETTINGS };

  const plain = record.get({ plain: true });
  return {
    show_all_tasks_to_all_roles: !!plain.show_all_tasks_to_all_roles,
    include_weekend_date: !!plain.include_weekend_date,
    include_holiday_date: !!plain.include_holiday_date,
    recalculate_estimated_end_dates_future_tasks: !!plain.recalculate_estimated_end_dates_future_tasks,
    recalculate_estimated_dates_based_on_actual_changes: !!plain.recalculate_estimated_dates_based_on_actual_changes,
  };
}

/**
 * Active company holidays for a tenant. Skipped entirely when holidays are
 * being counted as working days — nothing to subtract in that case.
 */
export async function getTenantHolidays({ builderId, companyId }) {
  const { Holiday, Sequelize } = db;
  const { Op } = Sequelize;

  const scopes = [];
  if (companyId) scopes.push({ company_id: companyId });
  if (builderId) scopes.push({ builder_id: builderId });
  if (scopes.length === 0) return [];

  const holidays = await Holiday.findAll({
    where: { status: true, [Op.or]: scopes },
    attributes: ["holiday_start_date", "holiday_end_date"],
  });

  return holidays.map((holiday) => holiday.get({ plain: true }));
}

/* =========================================================
   ROLE VISIBILITY  ("Show all Tasks to all Roles")
========================================================= */

/**
 * Drop tasks the viewer's role is not meant to see.
 *
 * Only applies to a job's own workflow — the template configuration screens
 * always list everything.
 *
 * A task survives the filter when any of these hold:
 *   - the setting is on, or the viewer has no role to narrow by;
 *   - it is unassigned (otherwise it would be invisible to the whole company);
 *   - it is assigned to the viewer's own role — the point of the setting;
 *   - the viewer administers the workflow (tiers 1–2). They add the stages and
 *     tasks in the first place, so a filtered view would blank out sub-stages
 *     they had just filled in;
 *   - the viewer created it. Whoever adds a task keeps seeing it regardless of
 *     which role they assigned it to.
 *
 * The last two rules are what keep a newly created task on screen after a
 * reload: the create response is unfiltered, so without them a task assigned to
 * another role would show once and then vanish on the next read.
 */
export function filterTasksForViewer(tasks, settings, viewer) {
  const roleId = viewer?.roleId;
  if (!roleId || settings?.show_all_tasks_to_all_roles) return tasks || [];
  if (managesWorkflow(viewer?.roleName)) return tasks || [];

  const userId = viewer?.userId ?? null;

  return (tasks || []).filter((task) => {
    const assigneeId = task.assignee_id ?? task.assignee?.role_id ?? task.assignee?.id ?? null;
    if (!assigneeId || assigneeId === roleId) return true;
    return !!userId && task.created_by === userId;
  });
}

/* =========================================================
   SCHEDULE
========================================================= */

/**
 * Where the chain starts. Contract dates are the real-world trigger for a job's
 * workflow; a job that has neither yet falls back to when it was created so the
 * schedule is still meaningful.
 */
function resolveAnchorDate(job) {
  return (
    toUtcDate(job?.contract_signed_date) ||
    toUtcDate(job?.contract_prepared_date) ||
    // The model declares `createdAt` with underscored field mapping, so the
    // plain object can carry either spelling depending on the Sequelize path.
    toUtcDate(job?.created_at) ||
    toUtcDate(job?.createdAt) ||
    toUtcDate(new Date())
  );
}

/**
 * Load a job's workflow rows in schedule order: workflow stages by sort order,
 * then their sub-stages, then each sub-stage's tasks.
 *
 * Skipped and un-synced rows are left out of the chain — they are not part of
 * the active workflow, so they must not consume calendar time — but their ids
 * are still returned so callers can clear any stale dates on them.
 */
async function loadOrderedTasks(jobId, transaction) {
  const { JobSubStage, JobTask, JobTaskDependency, JobProcessStage, JobProcessStageFunctionality } = db;

  const subStages = await JobSubStage.findAll({
    where: { job_id: jobId },
    include: [
      {
        model: JobProcessStage,
        as: "stage",
        required: true,
        attributes: ["stage_id", "sort_order"],
        include: [
          {
            model: JobProcessStageFunctionality,
            as: "functionality",
            required: true,
            where: { is_workflow: true },
            attributes: [],
          },
        ],
      },
      { model: JobTask, as: "tasks", required: false },
    ],
    transaction,
  });

  const ordered = [];
  const excluded = [];

  const sortedSubStages = subStages
    .map((subStage) => subStage.get({ plain: true }))
    .sort((a, b) => {
      const stageDiff = (a.stage?.sort_order ?? 0) - (b.stage?.sort_order ?? 0);
      if (stageDiff !== 0) return stageDiff;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

  for (const subStage of sortedSubStages) {
    const tasks = [...(subStage.tasks || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const subStageActive = subStage.is_synced !== false && !subStage.is_skipped;

    for (const task of tasks) {
      if (subStageActive && task.is_synced !== false) {
        ordered.push(task);
      } else {
        excluded.push(task);
      }
    }
  }

  const taskIds = ordered.map((task) => task.job_process_task_id);
  const dependencies = taskIds.length
    ? await JobTaskDependency.findAll({
      where: { task_id: taskIds },
      attributes: ["task_id", "predecessor_task_id"],
      transaction,
    })
    : [];

  const predecessorsByTask = new Map();
  for (const dependency of dependencies) {
    const list = predecessorsByTask.get(dependency.task_id) || [];
    list.push(dependency.predecessor_task_id);
    predecessorsByTask.set(dependency.task_id, list);
  }

  return { ordered, excluded, predecessorsByTask };
}

/**
 * Walk the chain and derive every task's estimated start/end date.
 *
 * Returns the derived schedule without touching the database — `persist` is
 * what writes it — so the same code can produce the preview the confirmation
 * popup needs when automatic recalculation is switched off.
 */
export function buildSchedule({ tasks, predecessorsByTask, calendar, anchor, settings }) {
  const propagateOverrides = !!settings.recalculate_estimated_end_dates_future_tasks;
  const schedule = new Map();

  let cursor = anchor;

  for (const task of tasks) {
    let start = calendar.nextWorkingDay(cursor);

    // A task cannot start before every predecessor already placed has finished.
    for (const predecessorId of predecessorsByTask.get(task.job_process_task_id) || []) {
      const predecessor = schedule.get(predecessorId);
      if (!predecessor) continue;
      const earliest = calendar.dayAfter(predecessor.end);
      if (earliest.getTime() > start.getTime()) start = earliest;
    }

    const derivedEnd = calendar.endOfDuration(start, task.no_of_days);

    // A hand-edited end date wins for the task itself. Whether it also drags
    // the rest of the chain along is the "future tasks" setting.
    const lockedEnd = task.estimated_date_locked ? toUtcDate(task.estimated_end_date) : null;
    const end = lockedEnd || derivedEnd;

    schedule.set(task.job_process_task_id, { start, end });

    const appliedActual = task.actual_date_applied ? toUtcDate(task.actual_date) : null;
    const chainEnd = appliedActual || (propagateOverrides ? end : derivedEnd);

    cursor = calendar.dayAfter(chainEnd);
  }

  return schedule;
}

/**
 * Write a derived schedule back onto the job tasks, touching only the rows
 * whose dates actually moved.
 */
async function persistSchedule(schedule, scheduledTasks, excludedTasks, transaction) {
  const { JobTask } = db;

  const changed = [];
  for (const task of scheduledTasks) {
    const dates = schedule.get(task.job_process_task_id);
    if (!dates) continue;

    const start = toDateString(dates.start);
    const end = toDateString(dates.end);

    const storedStart = toDateString(toUtcDate(task.estimated_start_date));
    const storedEnd = toDateString(toUtcDate(task.estimated_end_date));

    if (storedStart !== start || storedEnd !== end) {
      changed.push({ taskId: task.job_process_task_id, start, end });
    }
  }

  await Promise.all(
    changed.map((write) =>
      JobTask.update(
        { estimated_start_date: write.start, estimated_end_date: write.end },
        { where: { job_process_task_id: write.taskId }, transaction },
      ),
    ),
  );

  // Rows that dropped out of the active workflow (skipped / un-synced) keep no
  // schedule, so a stale date can never be shown next to them.
  const staleIds = (excludedTasks || [])
    .filter((task) => task.estimated_start_date || task.estimated_end_date)
    .map((task) => task.job_process_task_id);

  if (staleIds.length) {
    await JobTask.update(
      { estimated_start_date: null, estimated_end_date: null },
      { where: { job_process_task_id: staleIds }, transaction },
    );
  }
}

/**
 * Recompute (and by default persist) a job's whole workflow schedule.
 *
 * Safe to call on every read: it is a pure function of the job's tasks, the
 * tenant's settings and its holidays, so repeated calls converge.
 *
 * @returns {Promise<Map<string, {start: Date, end: Date}>>} taskId → dates
 */
export async function recalculateJobWorkflowDates(jobId, options = {}) {
  const { Job } = db;
  const { transaction = null, persist = true } = options;

  if (!jobId) return new Map();

  // Not attribute-restricted on purpose: the anchor may come from the created
  // timestamp, whose attribute name differs from its underscored column.
  const job = await Job.findByPk(jobId, { transaction });
  if (!job) return new Map();

  const scope = { builderId: job.builder_id, companyId: job.company_id };
  const settings = options.settings || (await getWorkflowSettings(scope));
  const holidays = settings.include_holiday_date
    ? []
    : options.holidays || (await getTenantHolidays(scope));

  const calendar = createWorkingCalendar(settings, holidays);
  const { ordered, excluded, predecessorsByTask } = await loadOrderedTasks(jobId, transaction);

  // Lets a caller ask "what would the chain look like if…" without writing the
  // hypothetical to the database first — used by the confirmation preview.
  if (options.overrides) {
    for (const task of ordered) {
      const override = options.overrides[task.job_process_task_id];
      if (override) Object.assign(task, override);
    }
  }

  const schedule = buildSchedule({
    tasks: ordered,
    predecessorsByTask,
    calendar,
    anchor: resolveAnchorDate(job.get({ plain: true })),
    settings,
  });

  if (persist) {
    await persistSchedule(schedule, ordered, excluded, transaction);
  }

  return schedule;
}

/**
 * Recompute a job's schedule from whichever job a task belongs to. Template
 * (non-job) tasks have no schedule, so this is a no-op for them.
 */
export async function recalculateForTask(taskId, options = {}) {
  const { JobTask } = db;

  const task = await JobTask.findByPk(taskId, {
    attributes: ["job_process_task_id", "job_id"],
    transaction: options.transaction || null,
  });
  if (!task) return new Map();

  return recalculateJobWorkflowDates(task.job_id, options);
}

/**
 * Recompute a job's schedule from one of its sub-stages.
 */
export async function recalculateForSubStage(subStageId, options = {}) {
  const { JobSubStage } = db;

  const subStage = await JobSubStage.findByPk(subStageId, {
    attributes: ["sub_stage_id", "job_id"],
    transaction: options.transaction || null,
  });
  if (!subStage) return new Map();

  return recalculateJobWorkflowDates(subStage.job_id, options);
}

/**
 * What the chain would look like if a task's actual date were applied to it.
 * Backs the confirmation popup shown when automatic recalculation is off:
 * returns only the tasks whose estimated end date would move.
 */
export async function previewActualDateShift(taskId, options = {}) {
  const { JobTask } = db;
  const transaction = options.transaction || null;

  const task = await JobTask.findByPk(taskId, {
    attributes: ["job_process_task_id", "job_id", "actual_date", "actual_date_applied"],
    transaction,
  });
  if (!task || !task.job_id) return [];

  const shared = { transaction, persist: false, settings: options.settings, holidays: options.holidays };

  const current = await recalculateJobWorkflowDates(task.job_id, shared);

  // Same walk, but with this task's actual date honoured.
  const proposed = await recalculateJobWorkflowDates(task.job_id, {
    ...shared,
    overrides: { [taskId]: { actual_date_applied: true } },
  });

  const changes = [];
  for (const [id, dates] of proposed.entries()) {
    const before = current.get(id);
    if (!before) continue;
    if (before.end.getTime() !== dates.end.getTime()) {
      changes.push({
        taskId: id,
        from: toDateString(before.end),
        to: toDateString(dates.end),
      });
    }
  }

  return changes;
}

export default {
  DEFAULT_WORKFLOW_SETTINGS,
  getWorkflowSettings,
  getTenantHolidays,
  createWorkingCalendar,
  filterTasksForViewer,
  recalculateJobWorkflowDates,
  recalculateForTask,
  recalculateForSubStage,
  previewActualDateShift,
  toUtcDate,
  toDateString,
};
