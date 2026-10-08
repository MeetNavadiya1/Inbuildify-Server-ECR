import db from "../../config/database/models/postgre-models/index.js";
import { ensureWorkflowStageBySubStageId } from "./job-process-workflow.guard.js";
import { Sequelize } from "sequelize";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import { generatePresignedDownloadUrl } from "../../service/s3.service.js";
import { ensureUniqueDriveFileName } from "../../service/fileNaming.service.js";
import { resolveBySubStageId, resolveByTaskId, resolveBySubtaskId } from "./job-process-table-router.js";
import {
  getWorkflowSettings,
  filterTasksForViewer,
  recalculateJobWorkflowDates,
  previewActualDateShift,
  toUtcDate,
  toDateString,
} from "../job-workflow-setting/workflowSchedule.service.js";
import { evaluateJobAutomationSafely } from "../job/job-automation.service.js";
import sendEmail from "../../service/sendMail.service.js";
import {
  wrapTaskAssignmentHTML,
  buildDefaultAssignmentBody,
  formatEmailDate,
} from "../../templates/job-task-workflow.template.js";
import { env } from "../../config/env.config.js";
// Imported rather than re-derived so the cap rule lives in exactly one place.
// No cycle: the extension service does not import this module.
import {
  maxExtensionDaysFor,
  getExtensionAllowance,
  EXTENSION_STATUS,
} from "../job-workflow/job-task-extension.service.js";

const { Op } = Sequelize;

/**
 * The seeded role that owns the builder tier (see seeder/seedRoles.js). Matched
 * by name because the role row is per-builder, so there is no fixed id to key
 * off. Compared case/whitespace-insensitively.
 */
const BUILDER_ROLE_NAME = "builder";

/**
 * Resolve the PERSON a task is assigned to, given the role it belongs to.
 *
 * A task carries two things: `assignee_id` (the role, which drives the
 * "Show all Tasks to all Roles" visibility filter) and `assignee_user_id` (the
 * person). This decides the second from the first:
 *
 *   - Role is Builder  -> the Builder-role user of the JOB'S builder, chosen
 *                         automatically. Whatever the client sent is ignored,
 *                         so a tampered or stale payload cannot assign the task
 *                         to someone else's builder. Only when that builder has
 *                         no account at all does the requested user apply, on
 *                         the same terms as any other role — otherwise the task
 *                         would save with nobody on it.
 *   - Any other role   -> the requested user, which must actually hold that role.
 *   - No role          -> nobody. Clearing the role clears the person with it.
 *
 * Template tasks (no jobId) resolve the Builder case to null — there is no job
 * yet, so no builder to point at. They pick it up when cloned into a job, which
 * runs this same resolution.
 *
 * @param {string|null} roleId          The task's role (assignee_id).
 * @param {string|null} requestedUserId The user the client asked for.
 * @param {{jobId?: string|null, transaction?: object|null}} ctx
 * @returns {Promise<string|null>} users_id to persist, or null.
 */
export async function resolveAssigneeUser(roleId, requestedUserId, { jobId = null, transaction = null } = {}) {
  const { Role, Users, Job } = db;

  if (!roleId) return null;

  const role = await Role.findByPk(roleId, {
    attributes: ["role_id", "name"],
    transaction,
  });
  if (!role) {
    throw new Error("Assignee role not found");
  }

  if (role.name?.trim().toLowerCase() === BUILDER_ROLE_NAME) {
    if (!jobId) return null;

    const job = await Job.findByPk(jobId, {
      attributes: ["job_id", "builder_id"],
      transaction,
    });
    if (!job?.builder_id) return null;

    /*
     * Matched on the role's NAME rather than the id that was sent.
     *
     * There is one "Builder" role row per builder, and the role list the client
     * picks from is scoped to the COMPANY — so the id chosen can belong to a
     * different builder than the job does. Constraining the lookup on it then
     * matched nobody and the task saved with no assignee at all, silently.
     * The job's builder is the thing that decides who this is, so that is what
     * the lookup keys off.
     *
     * A builder tenant normally has a single Builder-role user; if more than
     * one exists the earliest is the account the builder was set up with.
     */
    const builderUser = await Users.findOne({
      where: { builder_id: job.builder_id, is_active: true },
      attributes: ["users_id"],
      include: [{
        model: Role,
        as: "role",
        attributes: [],
        required: true,
        where: db.sequelize.where(
          db.sequelize.fn("lower", db.sequelize.fn("btrim", db.sequelize.col("role.name"))),
          BUILDER_ROLE_NAME,
        ),
      }],
      order: [["createdAt", "ASC"]],
      transaction,
    });
    if (builderUser) return builderUser.users_id;

    // This builder has no user account to fill in from, so there is nobody to
    // choose automatically. Fall through to the person the client picked rather
    // than saving the task with no assignee at all — which is what happened,
    // silently, leaving the Assignee column empty on a task that had one
    // selected. The pick is still validated against the role below, and a
    // builder that DOES have an account still wins over anything sent.
  }

  if (!requestedUserId) return null;

  const assignee = await Users.findByPk(requestedUserId, {
    attributes: ["users_id", "role_id"],
    transaction,
  });
  if (!assignee) {
    throw new Error("Assignee user not found");
  }
  if (assignee.role_id !== roleId) {
    throw new Error("The selected assignee does not hold the selected role");
  }
  return assignee.users_id;
}

/**
 * Validate the SERVICE a task covers and the SUPPLIER doing it.
 *
 * This is the pair the workflow UI collects in place of Role/Assignee: the
 * service says what the task is (Plumbing, Framing, …), the supplier says who
 * has been given it.
 *
 *   - No service   -> nobody. Clearing the service clears the supplier with it,
 *                     because a supplier on a task only means anything as
 *                     "who is doing this service".
 *   - Service only -> the task is scoped but not yet handed out.
 *   - Both         -> each is checked against the caller's tenant, so a stale or
 *                     tampered payload cannot book another builder's supplier.
 *
 * Services are per-builder or global (builder_id NULL, the seeded ones), which
 * is the same visibility GET /service applies. Suppliers are strictly
 * per-builder/company, matching GET /supplier.
 *
 * @param {string|null} serviceId
 * @param {string|null} supplierId
 * @param {{builderId?: string|null, companyId?: string|null, transaction?: object|null}} ctx
 * @returns {Promise<{service_id: string|null, supplier_id: string|null}>}
 */
export async function resolveServiceSupplier(
  serviceId,
  supplierId,
  { builderId = null, companyId = null, transaction = null } = {},
) {
  const { Service, Supplier } = db;

  if (!serviceId) return { service_id: null, supplier_id: null };

  const service = await Service.findOne({
    where: {
      service_id: serviceId,
      is_deleted: false,
      [Op.or]: [{ builder_id: null }, { builder_id: builderId }],
    },
    attributes: ["service_id"],
    transaction,
  });
  if (!service) {
    throw new Error("Service not found");
  }

  if (!supplierId) return { service_id: serviceId, supplier_id: null };

  const supplier = await Supplier.findOne({
    where: { supplier_id: supplierId, builder_id: builderId, company_id: companyId },
    attributes: ["supplier_id"],
    transaction,
  });
  if (!supplier) {
    throw new Error("Supplier not found");
  }

  return { service_id: serviceId, supplier_id: supplier.supplier_id };
}

/** The service/supplier shape every task response carries. */
function mapServiceSupplier(plain) {
  return {
    service: plain.service
      ? { id: plain.service.service_id, name: plain.service.service }
      : null,
    supplier: plain.supplier
      ? { id: plain.supplier.supplier_id, name: plain.supplier.company_name }
      : null,
  };
}

/** The includes needed to fill `mapServiceSupplier`. */
function serviceSupplierIncludes() {
  return [
    { model: db.Service, as: "service", attributes: ["service_id", "service"], required: false },
    { model: db.Supplier, as: "supplier", attributes: ["supplier_id", "company_name"], required: false },
  ];
}

/**
 * Recompute and persist a sub-stage's completion flag from its tasks.
 *
 * A sub-stage is fully complete only when it has at least one task and every one
 * of those tasks is completed. Completing the last open task marks the sub-stage
 * complete; un-completing a task (or adding a new one) drops it back to
 * incomplete. Writes only when the derived value differs from what is stored.
 */
async function recomputeSubStageCompletion(SubStage, Task, subStageId, transaction) {
  const subStage = await SubStage.findByPk(subStageId, {
    attributes: ["sub_stage_id", "is_completed"],
    transaction,
  });
  if (!subStage) return;

  const totalTasks = await Task.count({
    where: { sub_stage_id: subStageId },
    transaction,
  });
  const incompleteTasks = totalTasks === 0
    ? 0
    : await Task.count({
      where: { sub_stage_id: subStageId, is_completed: false },
      transaction,
    });

  const shouldBeCompleted = totalTasks > 0 && incompleteTasks === 0;

  if (subStage.is_completed !== shouldBeCompleted) {
    await subStage.update(
      { is_completed: shouldBeCompleted, updated_at: new Date() },
      { transaction },
    );
  }
}

/**
 * CREATE TASK + DEPENDENCIES
 *
 * `user` is the creating user. Job tasks record it so the task stays visible to
 * whoever added it when "Show all Tasks to all Roles" is off — see
 * `filterTasksForViewer`.
 */
export async function createTaskService(subStageId, payload, builderId, companyId, user = null) {
  await ensureWorkflowStageBySubStageId(subStageId);

  const { JobProcessStage, DocumentCommonFolder, Role } = db;
  const { SubStage, Task, Dependency, isJob } = await resolveBySubStageId(subStageId);

  return await db.sequelize.transaction(async (t) => {
    // Check sub-stage and parent stage for ownership
    const subStage = await SubStage.findByPk(subStageId, {
      include: [{
        model: JobProcessStage,
        as: "stage",
        attributes: ["stage_id", "builder_id", "company_id"],
      }],
      transaction: t,
    });

    if (!subStage) {
      throw new Error("Sub-stage not found");
    }

    if (subStage.stage.builder_id !== builderId && subStage.stage.company_id !== companyId) {
      throw new Error("You can only create tasks for your own sub-stages");
    }

    // Validate the role and resolve the person holding it. Throws if the role
    // is unknown, so the previous standalone role check is covered here too.
    const assigneeUserId = await resolveAssigneeUser(
      payload.assignee_id,
      payload.assignee_user_id,
      { jobId: isJob ? subStage.job_id : null, transaction: t },
    );

    // What the task is (service) and who is doing it (supplier). Both are
    // checked against the caller's tenant.
    const booking = await resolveServiceSupplier(
      payload.service_id,
      payload.supplier_id,
      { builderId, companyId, transaction: t },
    );

    // Validate Folder
    if (payload.folder_id) {
      const folder = await DocumentCommonFolder.findByPk(payload.folder_id, { transaction: t });
      if (!folder) {
        throw new Error("Folder not found");
      }
    }

    // Duplicate check
    const duplicate = await Task.findOne({
      where: { sub_stage_id: subStageId, name: payload.name },
      transaction: t,
    });

    if (duplicate) {
      throw new Error(`Task with name ${payload.name} already exists for this sub-stage`);
    }

    // Sort order rebalancing
    const maxSortOrder = (await Task.max("sort_order", {
      where: { sub_stage_id: subStageId },
      transaction: t,
    })) || 0;

    let finalSortOrder;
    if (payload.sort_order !== undefined) {
      finalSortOrder = payload.sort_order;
    } else {
      finalSortOrder = maxSortOrder + 1;
    }

    if (finalSortOrder < 1 || finalSortOrder > maxSortOrder + 1) {
      throw new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`);
    }

    if (payload.sort_order !== undefined) {
      await Task.increment("sort_order", {
        by: 1,
        where: {
          sub_stage_id: subStageId,
          sort_order: { [Op.gte]: payload.sort_order },
        },
        transaction: t,
      });
    }

    const task = await Task.create({
      sub_stage_id: subStageId,
      name: payload.name,
      description: payload.description || null,
      sort_order: finalSortOrder,
      folder_id: payload.folder_id || null,
      no_of_days: payload.no_of_days,
      assignee_id: payload.assignee_id,
      assignee_user_id: assigneeUserId,
      service_id: booking.service_id,
      supplier_id: booking.supplier_id,
      notify: payload.notify,
      milestone: payload.milestone,
      attachment_mandatory: payload.attachment_mandatory,
      ...(payload.is_synced !== undefined ? { is_synced: payload.is_synced } : {}),
      ...(isJob
        ? {
          job_id: subStage.job_id,
          builder_id: builderId,
          company_id: companyId,
          created_by: user?.users_id ?? null,
        }
        : {}),
    }, { transaction: t });

    // Adding a new task means the sub-stage is no longer fully complete
    if (subStage.is_completed) {
      await SubStage.update(
        { is_completed: false },
        { where: { sub_stage_id: subStageId }, transaction: t }
      );
    }

    // Handle Dependencies
    if (payload.predecessor_task_ids && payload.predecessor_task_ids.length > 0) {
      for (const depId of payload.predecessor_task_ids) {
        if (depId === task.job_process_task_id) {
          throw new Error("Task cannot depend on itself");
        }
        await Dependency.create({
          task_id: task.job_process_task_id,
          predecessor_task_id: depId,
        }, { transaction: t });
      }
    }

    // A new task lengthens the chain, so every task after it shifts.
    if (isJob) {
      await recalculateJobWorkflowDates(subStage.job_id, { transaction: t });
    }

    // Fetch refreshed task with assignee (role + person) and booking
    // (service + supplier) info
    const refreshedTask = await Task.findByPk(task.job_process_task_id, {
      include: [
        { model: Role, as: "assignee", attributes: ["role_id", "name"] },
        { model: db.Users, as: "assigneeUser", attributes: ["users_id", "name"] },
        ...serviceSupplierIncludes(),
      ],
      transaction: t,
    });

    const plain = refreshedTask.get({ plain: true });
    return {
      job_process_task_id: plain.job_process_task_id,
      sub_stage_id: plain.sub_stage_id,
      name: plain.name,
      description: plain.description,
      sort_order: plain.sort_order,
      folder_id: plain.folder_id,
      no_of_days: plain.no_of_days,
      is_synced: plain.is_synced,
      assignee: plain.assignee ? { id: plain.assignee.role_id, name: plain.assignee.name } : null,
      assignee_user: plain.assigneeUser
        ? { id: plain.assigneeUser.users_id, name: plain.assigneeUser.name }
        : null,
      ...mapServiceSupplier(plain),
      notify: plain.notify,
      milestone: plain.milestone,
      attachment_mandatory: plain.attachment_mandatory,
      estimated_start_date: plain.estimated_start_date ?? null,
      estimated_end_date: plain.estimated_end_date ?? null,
      created_at: plain.created_at,
      updated_at: plain.updated_at,
    };
  });
}

export async function updateTask(taskId, payload, builderId, companyId, user = null) {
  const { JobProcessStage, DocumentCommonFolder, Role } = db;
  const { Task, SubStage, Dependency, isJob } = await resolveByTaskId(taskId);

  // Captured inside the transaction so the Job Settings automations can be
  // evaluated once it has committed (see below).
  let automationJobId = null;

  const result = await db.sequelize.transaction(async (t) => {
    // Ownership check via deep join
    const task = await Task.findByPk(taskId, {
      include: [{
        model: SubStage,
        as: "subStage",
        include: [{
          model: JobProcessStage,
          as: "stage",
          where: { builder_id: builderId, company_id: companyId },
        }],
      }],
      transaction: t,
    });

    if (!task) {
      throw new Error("Task not found");
    }

    if (isJob) {
      automationJobId = task.job_id;
    }

    /* ---------------------------------------------------------------
       Assignee (role + person).

       This is a partial update, so only re-resolve when the caller actually
       touched one of the two fields — otherwise a payload that just ticks
       "Done" would clear the assignee. When either is sent, both are settled
       together against the resulting role: changing the role away from Builder
       drops the auto-assigned builder, and changing it TO Builder assigns the
       job's builder regardless of what the client sent.
    --------------------------------------------------------------- */
    const assigneeTouched =
      payload.assignee_id !== undefined || payload.assignee_user_id !== undefined;
    let resolvedAssigneeUserId;

    if (assigneeTouched) {
      const effectiveRoleId =
        payload.assignee_id !== undefined ? payload.assignee_id : task.assignee_id;
      resolvedAssigneeUserId = await resolveAssigneeUser(
        effectiveRoleId,
        payload.assignee_user_id,
        { jobId: isJob ? task.job_id : null, transaction: t },
      );
    }

    /* ---------------------------------------------------------------
       Booking (service + supplier).

       Settled the same way as the assignee above: only re-resolved when the
       caller touched one of the two, and both are settled together so clearing
       the service takes the supplier with it.
    --------------------------------------------------------------- */
    const bookingTouched =
      payload.service_id !== undefined || payload.supplier_id !== undefined;
    let resolvedBooking;

    if (bookingTouched) {
      resolvedBooking = await resolveServiceSupplier(
        payload.service_id !== undefined ? payload.service_id : task.service_id,
        payload.supplier_id !== undefined ? payload.supplier_id : task.supplier_id,
        { builderId, companyId, transaction: t },
      );
    }

    // Validate Folder
    if (payload.folder_id) {
      const folder = await DocumentCommonFolder.findByPk(payload.folder_id, { transaction: t });
      if (!folder) {
        throw new Error("Folder not found");
      }
    }

    // Duplicate check
    if (payload.name && payload.name !== task.name) {
      const duplicate = await Task.findOne({
        where: {
          sub_stage_id: task.sub_stage_id,
          name: payload.name,
          job_process_task_id: { [Op.ne]: taskId },
        },
        transaction: t,
      });

      if (duplicate) {
        throw new Error(`Task with name ${payload.name} already exists for this sub-stage`);
      }
    }

    // Handle sort order shifting
    if (payload.sort_order !== undefined && payload.sort_order !== task.sort_order) {
      const maxSortOrder = await Task.max("sort_order", {
        where: { sub_stage_id: task.sub_stage_id },
        transaction: t,
      });

      if (payload.sort_order < 1 || payload.sort_order > maxSortOrder) {
        throw new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder}.`);
      }

      const oldOrder = task.sort_order;
      const newOrder = payload.sort_order;

      if (newOrder > oldOrder) {
        await Task.decrement("sort_order", {
          by: 1,
          where: {
            sub_stage_id: task.sub_stage_id,
            sort_order: { [Op.gt]: oldOrder, [Op.lte]: newOrder },
            job_process_task_id: { [Op.ne]: taskId },
          },
          transaction: t,
        });
      } else {
        await Task.increment("sort_order", {
          by: 1,
          where: {
            sub_stage_id: task.sub_stage_id,
            sort_order: { [Op.lt]: oldOrder, [Op.gte]: newOrder },
            job_process_task_id: { [Op.ne]: taskId },
          },
          transaction: t,
        });
      }
    }

    let attachmentsIds = null;
    if (payload.attachments !== undefined) {
      attachmentsIds = Array.isArray(payload.attachments)
        ? payload.attachments.map(att => (typeof att === "string" ? att : att?.id || att?.file_id)).filter(Boolean)
        : [];
    }

    const updateData = {
      name: payload.name,
      description: payload.description,
      sort_order: payload.sort_order,
      folder_id: payload.folder_id,
      no_of_days: payload.no_of_days,
      assignee_id: payload.assignee_id,
      notify: payload.notify,
      milestone: payload.milestone,
      attachment_mandatory: payload.attachment_mandatory,
      is_completed: payload.is_completed,
      is_synced: payload.is_synced,
      actual_date: payload.actual_date,
      notes: payload.notes,
      updated_at: new Date(),
    };
    if (attachmentsIds !== null) {
      updateData.attachments = attachmentsIds;
    }
    // Only written when the caller touched the role or the person — see above.
    if (assigneeTouched) {
      updateData.assignee_user_id = resolvedAssigneeUserId;
    }
    // Same for the service and the supplier holding it.
    if (bookingTouched) {
      updateData.service_id = resolvedBooking.service_id;
      updateData.supplier_id = resolvedBooking.supplier_id;
    }

    /* ---------------------------------------------------------------
       Workflow schedule (job instances only — template tasks have no
       anchor date to chain from).
    --------------------------------------------------------------- */
    const settings = isJob ? await getWorkflowSettings({ builderId, companyId }) : null;

    if (isJob) {
      // A hand-entered estimated end date pins the task: the recalculation
      // keeps it instead of deriving one. Clearing it hands the task back to
      // the chain.
      if (payload.estimated_end_date !== undefined) {
        const overrideEnd = toDateString(toUtcDate(payload.estimated_end_date));
        updateData.estimated_end_date = overrideEnd;
        updateData.estimated_date_locked = !!overrideEnd;
      } else if (payload.estimated_date_locked === false) {
        updateData.estimated_date_locked = false;
      }

      // Recording an actual date only re-bases the rest of the chain when the
      // "recalculate on actual date changes" setting says so. With it off the
      // shift waits for the user's confirmation, which arrives as
      // apply_actual_date.
      if (payload.actual_date !== undefined) {
        const hasActual = !!toUtcDate(payload.actual_date);
        updateData.actual_date_applied =
          hasActual && !!settings.recalculate_estimated_dates_based_on_actual_changes;
      }

      if (payload.apply_actual_date !== undefined) {
        updateData.actual_date_applied = !!payload.apply_actual_date;
      }
    }

    await task.update(updateData, { transaction: t });

    // Keep the sub-stage's completion flag in sync: completing the last open task
    // marks it complete, un-completing a task drops it back to incomplete.
    if (payload.is_completed !== undefined) {
      await recomputeSubStageCompletion(SubStage, Task, task.sub_stage_id, t);
    }

    // Handle dependencies
    if (payload.predecessor_task_ids !== undefined) {
      await Dependency.destroy({
        where: { task_id: taskId },
        transaction: t,
      });

      for (const depId of payload.predecessor_task_ids || []) {
        if (depId === taskId) {
          throw new Error("Task cannot depend on itself");
        }
        await Dependency.create({
          task_id: taskId,
          predecessor_task_id: depId,
        }, { transaction: t });
      }
    }

    // Durations, ordering, dependencies, locks and applied actual dates all
    // feed the chain, so re-derive the whole job's schedule once the row is
    // settled. This spans every workflow stage of the job — editing a
    // pre-construction task moves construction and post-construction ones too.
    let pendingRecalculation = null;
    if (isJob) {
      await recalculateJobWorkflowDates(task.job_id, { transaction: t, settings });

      // Setting off + an actual date just recorded: hand the frontend the list
      // of dates that *would* move so it can ask before applying them.
      const awaitingConfirmation =
        payload.actual_date !== undefined &&
        !!toUtcDate(payload.actual_date) &&
        !settings.recalculate_estimated_dates_based_on_actual_changes &&
        payload.apply_actual_date === undefined;

      if (awaitingConfirmation) {
        const changes = await previewActualDateShift(taskId, { transaction: t, settings });
        if (changes.length) {
          pendingRecalculation = { taskId, changes };
        }
      }
    }

    // Refresh with dependencies, assignee and booking
    const refreshed = await Task.findByPk(taskId, {
      include: [
        { model: Role, as: "assignee", attributes: ["role_id", "name"] },
        { model: db.Users, as: "assigneeUser", attributes: ["users_id", "name"] },
        ...serviceSupplierIncludes(),
        {
          model: Dependency,
          as: "taskDependencies",
          include: [{ model: Task, as: "predecessorTask", attributes: ["job_process_task_id", "name"] }],
        },
      ],
      transaction: t,
    });

    const plain = refreshed.get({ plain: true });

    // Resolve attachments details
    const fileIds = plain.attachments || [];
    let driveFiles = [];
    if (fileIds.length > 0) {
      driveFiles = await db.DriveFile.findAll({
        where: { file_id: { [Op.in]: fileIds } },
        include: [
          { model: db.Users, as: "uploadedByUser", attributes: ["name"] }
        ],
        transaction: t,
      });
    }

    const resolvedAttachments = await Promise.all(
      driveFiles.map(async (file) => {
        const sizeInMB = file.size ? `${(Number(file.size) / (1024 * 1024)).toFixed(1)} MB` : null;
        const presignedResult = await generatePresignedDownloadUrl(file.s3_key).catch(() => null);
        return {
          id: file.file_id,
          name: file.original_name,
          size: sizeInMB || undefined,
          url: presignedResult?.success ? presignedResult.url : null,
          createdAt: file.created_at,
          uploadedBy: file.uploadedByUser ? file.uploadedByUser.name : null,
        };
      })
    );

    return {
      job_process_task_id: plain.job_process_task_id,
      sub_stage_id: plain.sub_stage_id,
      name: plain.name,
      description: plain.description,
      sort_order: plain.sort_order,
      folder_id: plain.folder_id,
      no_of_days: plain.no_of_days,
      is_synced: plain.is_synced,
      assignee: plain.assignee ? { id: plain.assignee.role_id, name: plain.assignee.name } : null,
      assignee_user: plain.assigneeUser
        ? { id: plain.assigneeUser.users_id, name: plain.assigneeUser.name }
        : null,
      ...mapServiceSupplier(plain),
      notify: plain.notify,
      milestone: plain.milestone,
      is_completed: plain.is_completed,
      actual_date: plain.actual_date,
      estimated_start_date: plain.estimated_start_date ?? null,
      estimated_end_date: plain.estimated_end_date ?? null,
      estimated_date_locked: plain.estimated_date_locked ?? false,
      actual_date_applied: plain.actual_date_applied ?? false,
      // Present only when the user has to confirm shifting the later tasks.
      pending_recalculation: pendingRecalculation,
      notes: plain.notes,
      attachments: resolvedAttachments,
      predecessor_task_ids: (plain.taskDependencies || []).map((td) => ({
        id: td.predecessor_task_id,
        name: td.predecessorTask?.name,
      })),
      created_at: plain.created_at,
      updated_at: plain.updated_at,
    };
  });

  // Completing a task can close its sub-stage, and closing the last sub-stage of
  // a stage is exactly what Settings → Job → Settings reacts to (move the job to
  // maintenance / mark it completed). Runs after the commit so the automation
  // reads the settled workflow, and never fails the update.
  if (isJob && payload.is_completed !== undefined) {
    await evaluateJobAutomationSafely(automationJobId, { user });
  }

  return result;
}

export async function deleteTask(taskId, builderId, companyId) {
  const { JobProcessStage } = db;
  const { Task, SubStage, Dependency, isJob } = await resolveByTaskId(taskId);

  return await db.sequelize.transaction(async (t) => {
    // Ownership check via join
    const task = await Task.findByPk(taskId, {
      include: [{
        model: SubStage,
        as: "subStage",
        include: [{
          model: JobProcessStage,
          as: "stage",
          where: { builder_id: builderId, company_id: companyId },
        }],
      }],
      transaction: t,
    });

    if (!task) {
      throw new Error("Task not found");
    }

    const existingSortOrder = task.sort_order;
    const subStageId = task.sub_stage_id;
    const jobId = isJob ? task.job_id : null;

    // Shift trailing tasks
    await Task.decrement("sort_order", {
      by: 1,
      where: {
        sub_stage_id: subStageId,
        sort_order: { [Op.gt]: existingSortOrder },
      },
      transaction: t,
    });

    // Destroy task
    await task.destroy({ transaction: t });

    // Cleanup dependencies where it was a predecessor
    await Dependency.destroy({
      where: { predecessor_task_id: taskId },
      transaction: t,
    });

    // Removing the last open task can leave the sub-stage fully complete (and
    // removing the last task of all makes it empty, i.e. incomplete again).
    await recomputeSubStageCompletion(SubStage, Task, subStageId, t);

    // The chain is shorter now — everything after the deleted task moves up.
    if (jobId) {
      await recalculateJobWorkflowDates(jobId, { transaction: t });
    }
  });
}

export async function getTasks(subStageId, builderId, companyId, viewer = null) {
  const { JobProcessStage, DocumentCommonFolder, Role } = db;
  const { Task, SubStage, Dependency, Subtask, isJob } = await resolveBySubStageId(subStageId);

  // Keep a job's schedule current on read, the same way the sub-stage list does.
  const settings = isJob ? await getWorkflowSettings({ builderId, companyId }) : null;
  if (isJob) {
    const owner = await SubStage.findByPk(subStageId, { attributes: ["sub_stage_id", "job_id"] });
    if (owner?.job_id) {
      await recalculateJobWorkflowDates(owner.job_id, { settings });
    }
  }

  const tasks = await Task.findAll({
    where: { sub_stage_id: subStageId },
    include: [
      {
        model: SubStage,
        as: "subStage",
        required: true,
        include: [{
          model: JobProcessStage,
          as: "stage",
          required: true,
          where: { [Op.or]: [{ builder_id: builderId }, { company_id: companyId }] },
        }],
      },
      { model: Role, as: "assignee", attributes: ["role_id", "name"] },
      { model: db.Users, as: "assigneeUser", attributes: ["users_id", "name"] },
      ...serviceSupplierIncludes(),
      { model: DocumentCommonFolder, as: "folder", attributes: ["document_common_folder_id", "name"] },
      {
        model: Dependency,
        as: "taskDependencies",
        include: [{ model: Task, as: "predecessorTask", attributes: ["job_process_task_id", "name"] }],
      },
      { model: Subtask, as: "subtasks" },
    ],
    order: [
      ["sort_order", "ASC"],
      [{ model: Subtask, as: "subtasks" }, "sort_order", "ASC"],
    ],
  });

  // Extract all referenced file IDs across tasks
  const allFileIds = [];
  tasks.forEach((t) => {
    if (Array.isArray(t.attachments)) {
      allFileIds.push(...t.attachments);
    }
  });

  let driveFiles = [];
  if (allFileIds.length > 0) {
    driveFiles = await db.DriveFile.findAll({
      where: {
        file_id: { [Op.in]: allFileIds },
      },
      include: [
        { model: db.Users, as: "uploadedByUser", attributes: ["name"] }
      ],
    });
  }

  // Resolve presigned URLs for each file in parallel
  const fileMap = {};
  await Promise.all(
    driveFiles.map(async (file) => {
      const sizeInMB = file.size ? `${(Number(file.size) / (1024 * 1024)).toFixed(1)} MB` : null;
      const presignedResult = await generatePresignedDownloadUrl(file.s3_key).catch(() => null);
      fileMap[file.file_id] = {
        id: file.file_id,
        name: file.original_name,
        size: sizeInMB || undefined,
        url: presignedResult?.success ? presignedResult.url : null,
        createdAt: file.created_at,
        uploadedBy: file.uploadedByUser ? file.uploadedByUser.name : null,
      };
    })
  );

  const visibleTasks = isJob
    ? filterTasksForViewer(tasks.map((t) => t.get({ plain: true })), settings, viewer)
    : tasks.map((t) => t.get({ plain: true }));

  /* ---------------------------------------------------------------
     Extension chances left per task.

     Counted once for the whole sub-stage rather than per row. Job tasks only:
     a template task has no schedule to extend. Every APPROVED request spends a
     chance, whoever raised it — see getExtensionAllowance.
  --------------------------------------------------------------- */
  const extensionLimit = env.WORKFLOW_TASK.EXTENSION_LIMIT;
  const extensionsUsedByTask = {};
  if (isJob && visibleTasks.length) {
    const counts = await db.JobTaskExtensionRequest.findAll({
      attributes: [
        "task_id",
        [Sequelize.fn("COUNT", Sequelize.col("job_task_extension_request_id")), "used"],
      ],
      where: {
        task_id: { [Op.in]: visibleTasks.map((t) => t.job_process_task_id) },
        status: EXTENSION_STATUS.APPROVED,
      },
      group: ["task_id"],
      raw: true,
    });
    counts.forEach((row) => {
      extensionsUsedByTask[row.task_id] = Number(row.used) || 0;
    });
  }

  return visibleTasks.map((task) => {
    // A task with no duration has nothing to scale an extension from, so it
    // cannot be extended at all — null rather than a count, which the UI reads
    // as "no extension badge" instead of "no chances left".
    const canExtend = isJob && maxExtensionDaysFor(task.no_of_days) > 0;
    const extensionsUsed = extensionsUsedByTask[task.job_process_task_id] ?? 0;

    return {
      jobProcessTaskId: task.job_process_task_id,
      name: task.name,
      description: task.description,
      sortOrder: task.sort_order,
      noOfDays: task.no_of_days,
      isSynced: task.is_synced,
      assignee: task.assignee ? { id: task.assignee.role_id, name: task.assignee.name } : null,
      assigneeUser: task.assigneeUser
        ? { id: task.assigneeUser.users_id, name: task.assigneeUser.name }
        : null,
      ...mapServiceSupplier(task),
      folder: task.folder ? { id: task.folder.document_common_folder_id, name: task.folder.name } : null,
      notify: task.notify,
      milestone: task.milestone,
      attachmentMandatory: task.attachment_mandatory,
      isCompleted: task.is_completed,
      actualDate: task.actual_date,
      estimatedStartDate: task.estimated_start_date ?? null,
      estimatedEndDate: task.estimated_end_date ?? null,
      estimatedDateLocked: task.estimated_date_locked ?? false,
      actualDateApplied: task.actual_date_applied ?? false,
      notes: task.notes,
      // How many times this task may still be extended, for the count shown on
      // the mail icon. Null when the task cannot be extended at all.
      extensionLimit: canExtend ? extensionLimit : null,
      extensionsUsed: canExtend ? extensionsUsed : null,
      extensionsLeft: canExtend ? Math.max(0, extensionLimit - extensionsUsed) : null,
      attachments: Array.isArray(task.attachments)
        ? task.attachments.map(id => fileMap[id]).filter(Boolean)
        : [],
      predecessorTask: (task.taskDependencies || []).map((td) => ({
        taskId: td.predecessor_task_id,
        name: td.predecessorTask?.name,
      })),
      subTasks: (task.subtasks || []).map((st) => ({
        subTaskId: st.job_process_subtask_id,
        name: st.name,
        sortOrder: st.sort_order,
      })),
    };
  });
}

/**
 * CREATE SUB-TASK
 */
export async function createSubTask(taskId, payload, builderId, companyId) {
  const { JobProcessStage } = db;
  const { Task, SubStage, Subtask, isJob } = await resolveByTaskId(taskId);

  return await db.sequelize.transaction(async (t) => {
    // Ownership check via deep join
    const task = await Task.findByPk(taskId, {
      include: [{
        model: SubStage,
        as: "subStage",
        include: [{
          model: JobProcessStage,
          as: "stage",
          where: { builder_id: builderId, company_id: companyId },
        }],
      }],
      transaction: t,
    });

    if (!task) {
      throw new Error("Task not found");
    }

    // Duplicate check
    const duplicate = await Subtask.findOne({
      where: { job_process_task_id: taskId, name: payload.name },
      transaction: t,
    });

    if (duplicate) {
      throw new Error(`Sub-task with name ${payload.name} already exists for this task`);
    }

    // Sort order rebalancing
    const maxSortOrder = (await Subtask.max("sort_order", {
      where: { job_process_task_id: taskId },
      transaction: t,
    })) || 0;

    let finalSortOrder;
    if (payload.sort_order !== undefined) {
      finalSortOrder = payload.sort_order;
    } else {
      finalSortOrder = maxSortOrder + 1;
    }

    if (finalSortOrder < 1 || finalSortOrder > maxSortOrder + 1) {
      throw new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`);
    }

    if (payload.sort_order !== undefined) {
      await Subtask.increment("sort_order", {
        by: 1,
        where: {
          job_process_task_id: taskId,
          sort_order: { [Op.gte]: payload.sort_order },
        },
        transaction: t,
      });
    }

    const subTask = await Subtask.create({
      job_process_task_id: taskId,
      name: payload.name,
      sort_order: finalSortOrder,
      ...(isJob ? { job_id: task.job_id, builder_id: builderId, company_id: companyId } : {}),
    }, { transaction: t });

    // Refresh with parent task name
    const refreshed = await Subtask.findByPk(subTask.job_process_subtask_id, {
      include: [{ model: Task, as: "jobProcessTask", attributes: ["job_process_task_id", "name"] }],
      transaction: t,
    });

    const plain = refreshed.get({ plain: true });
    return {
      jobProcessSubtaskId: plain.job_process_subtask_id,
      name: plain.name,
      sortOrder: plain.sort_order,
      jobProcessTask: {
        id: plain.jobProcessTask.job_process_task_id,
        name: plain.jobProcessTask.name,
      },
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
    };
  });
}

export async function updateSubTask(subTaskId, payload, builderId, companyId) {
  const { JobProcessStage } = db;
  const { Task, SubStage, Subtask } = await resolveBySubtaskId(subTaskId);

  return await db.sequelize.transaction(async (t) => {
    // Ownership check via deep join
    const subTask = await Subtask.findByPk(subTaskId, {
      include: [{
        model: Task,
        as: "jobProcessTask",
        include: [{
          model: SubStage,
          as: "subStage",
          include: [{
            model: JobProcessStage,
            as: "stage",
            where: { builder_id: builderId, company_id: companyId },
          }],
        }],
      }],
      transaction: t,
    });

    if (!subTask) {
      throw new Error("Sub-task not found");
    }

    // Duplicate check
    if (payload.name && payload.name !== subTask.name) {
      const duplicate = await Subtask.findOne({
        where: {
          job_process_task_id: subTask.job_process_task_id,
          name: payload.name,
          job_process_subtask_id: { [Op.ne]: subTaskId },
        },
        transaction: t,
      });

      if (duplicate) {
        throw new Error(`Sub-task with name ${payload.name} already exists for this task`);
      }
    }

    // Sort order rebalancing
    if (payload.sort_order !== undefined && payload.sort_order !== subTask.sort_order) {
      const maxSortOrder = await Subtask.max("sort_order", {
        where: { job_process_task_id: subTask.job_process_task_id },
        transaction: t,
      });

      if (payload.sort_order < 1 || payload.sort_order > maxSortOrder) {
        throw new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder}.`);
      }

      const oldOrder = subTask.sort_order;
      const newOrder = payload.sort_order;

      if (newOrder > oldOrder) {
        await Subtask.decrement("sort_order", {
          by: 1,
          where: {
            job_process_task_id: subTask.job_process_task_id,
            sort_order: { [Op.gt]: oldOrder, [Op.lte]: newOrder },
            job_process_subtask_id: { [Op.ne]: subTaskId },
          },
          transaction: t,
        });
      } else {
        await Subtask.increment("sort_order", {
          by: 1,
          where: {
            job_process_task_id: subTask.job_process_task_id,
            sort_order: { [Op.lt]: oldOrder, [Op.gte]: newOrder },
            job_process_subtask_id: { [Op.ne]: subTaskId },
          },
          transaction: t,
        });
      }
    }

    await subTask.update({
      name: payload.name,
      sort_order: payload.sort_order,
    }, { transaction: t });

    // Refresh response data
    const refreshed = await Subtask.findByPk(subTaskId, {
      include: [{ model: Task, as: "jobProcessTask", attributes: ["job_process_task_id", "name"] }],
      transaction: t,
    });

    const plain = refreshed.get({ plain: true });
    return {
      jobProcessSubtaskId: plain.job_process_subtask_id,
      name: plain.name,
      sortOrder: plain.sort_order,
      jobProcessTask: {
        id: plain.jobProcessTask.job_process_task_id,
        name: plain.jobProcessTask.name,
      },
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
    };
  });
}

/**
 * DELETE SUB-TASK
 */
export async function deleteSubTask(subTaskId, builderId, companyId) {
  const { JobProcessStage } = db;
  const { Task, SubStage, Subtask } = await resolveBySubtaskId(subTaskId);

  return await db.sequelize.transaction(async (t) => {
    // Ownership check via deep join
    const subTask = await Subtask.findByPk(subTaskId, {
      include: [{
        model: Task,
        as: "jobProcessTask",
        include: [{
          model: SubStage,
          as: "subStage",
          include: [{
            model: JobProcessStage,
            as: "stage",
            where: { builder_id: builderId, company_id: companyId },
          }],
        }],
      }],
      transaction: t,
    });

    if (!subTask) {
      throw new Error("Sub-task not found");
    }

    const existingSortOrder = subTask.sort_order;
    const taskId = subTask.job_process_task_id;

    // Shift trailing sub-tasks
    await Subtask.decrement("sort_order", {
      by: 1,
      where: {
        job_process_task_id: taskId,
        sort_order: { [Op.gt]: existingSortOrder },
      },
      transaction: t,
    });

    await subTask.destroy({ transaction: t });
  });
}

/**
 * DELETE TASK DEPENDENCY
 */
export async function deleteTaskDependency(taskId, predecessorTaskId, builderId, companyId) {
  const { JobProcessStage } = db;
  const { Task, SubStage, Dependency } = await resolveByTaskId(taskId);

  return await db.sequelize.transaction(async (t) => {
    // Ownership check via join
    const task = await Task.findByPk(taskId, {
      include: [{
        model: SubStage,
        as: "subStage",
        include: [{
          model: JobProcessStage,
          as: "stage",
          where: { builder_id: builderId, company_id: companyId },
        }],
      }],
      transaction: t,
    });

    if (!task) {
      throw new Error("Task not found");
    }

    const dependency = await Dependency.findOne({
      where: { task_id: taskId, predecessor_task_id: predecessorTaskId },
      transaction: t,
    });

    if (!dependency) {
      throw new Error("Task dependency not found");
    }

    await dependency.destroy({ transaction: t });
  });
}

export async function getAllJobTasks(builderId, companyId) {
  const { JobProcessTask, JobProcessSubStage, JobProcessStage, JobProcessTaskDependency, JobProcessSubtask } = db;

  const tasks = await JobProcessTask.findAll({
    include: [
      {
        model: JobProcessSubStage,
        as: "subStage",
        required: true,
        include: [{
          model: JobProcessStage,
          as: "stage",
          required: true,
          where: { builder_id: builderId, company_id: companyId },
        }],
      },
      {
        model: JobProcessTaskDependency,
        as: "taskDependencies",
        include: [{ model: JobProcessTask, as: "predecessorTask", attributes: ["job_process_task_id", "name"] }],
      },
      { model: JobProcessSubtask, as: "subtasks" },
    ],
    order: [
      [{ model: JobProcessSubStage, as: "subStage" }, { model: JobProcessStage, as: "stage" }, "sort_order", "ASC"],
      [{ model: JobProcessSubStage, as: "subStage" }, "sort_order", "ASC"],
      ["sort_order", "ASC"],
      [{ model: JobProcessSubtask, as: "subtasks" }, "sort_order", "ASC"],
    ],
  });

  return tasks.map((t) => {
    const task = t.get({ plain: true });
    return {
      taskId: task.job_process_task_id,
      name: task.name,
      description: task.description,
      sortOrder: task.sort_order,
      noOfDays: task.no_of_days,
      assigneeId: task.assignee_id,
      assigneeUserId: task.assignee_user_id ?? null,
      serviceId: task.service_id ?? null,
      supplierId: task.supplier_id ?? null,
      notify: task.notify,
      milestone: task.milestone,
      attachmentMandatory: task.attachment_mandatory,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      predecessorTask: (task.taskDependencies || []).map((td) => ({
        id: td.predecessor_task_id,
        name: td.predecessorTask?.name || "Unknown Task",
      })),
      subStage: {
        subStageId: task.subStage.sub_stage_id,
        name: task.subStage.name,
        sortOrder: task.subStage.sort_order,
      },
      stage: {
        stageId: task.subStage.stage.stage_id,
        name: task.subStage.stage.name,
        sortOrder: task.subStage.stage.sort_order,
      },
      subTasks: (task.subtasks || []).map((st) => ({
        jobProcessSubtaskId: st.job_process_subtask_id,
        name: st.name,
        sortOrder: st.sort_order,
      })),
    };
  });
}

/**
 * GET SUB-TASKS BY TASK
 */
export async function getSubTasks(taskId, builderId, companyId) {
  const { JobProcessStage } = db;
  const { Task, SubStage, Subtask } = await resolveByTaskId(taskId);

  const subTasks = await Subtask.findAll({
    where: { job_process_task_id: taskId },
    include: [{
      model: Task,
      as: "jobProcessTask",
      required: true,
      include: [{
        model: SubStage,
        as: "subStage",
        required: true,
        include: [{
          model: JobProcessStage,
          as: "stage",
          required: true,
          where: { [Op.or]: [{ builder_id: builderId }, { company_id: companyId }] },
        }],
      }],
    }],
    order: [["sort_order", "ASC"]],
  });

  return subTasks.map((st) => {
    const subTask = st.get({ plain: true });
    return {
      jobProcessSubtaskId: subTask.job_process_subtask_id,
      name: subTask.name,
      sortOrder: subTask.sort_order,
      jobProcessTask: {
        id: subTask.jobProcessTask.job_process_task_id,
        name: subTask.jobProcessTask.name,
      },
      createdAt: subTask.createdAt,
      updatedAt: subTask.updatedAt,
    };
  });
}

/**
 * GET ALL TASKS - TASK DETAILS ONLY
 */
export async function getAllTasksOnly(builderId, companyId) {
  const { JobProcessTask, JobProcessSubStage, JobProcessStage, JobProcessTaskDependency } = db;

  const tasks = await JobProcessTask.findAll({
    include: [
      {
        model: JobProcessSubStage,
        as: "subStage",
        required: true,
        include: [{
          model: JobProcessStage,
          as: "stage",
          required: true,
          where: { builder_id: builderId, company_id: companyId },
        }],
      },
      {
        model: JobProcessTaskDependency,
        as: "taskDependencies",
        include: [{ model: JobProcessTask, as: "predecessorTask", attributes: ["job_process_task_id", "name"] }],
      },
    ],
    order: [["sort_order", "ASC"]],
  });

  return tasks.map((t) => {
    const task = t.get({ plain: true });
    return {
      jobProcessTaskId: task.job_process_task_id,
      name: task.name,
      description: task.description,
      sortOrder: task.sort_order,
      noOfDays: task.no_of_days,
      assigneeId: task.assignee_id,
      assigneeUserId: task.assignee_user_id ?? null,
      serviceId: task.service_id ?? null,
      supplierId: task.supplier_id ?? null,
      notify: task.notify,
      milestone: task.milestone,
      attachmentMandatory: task.attachment_mandatory,
      predecessorTask: (task.taskDependencies || []).map((td) => ({
        id: td.predecessor_task_id,
        name: td.predecessorTask?.name || "Unknown Task",
      })),
      createdAt: task.created_at,
      updated_at: task.updated_at,
    };
  });
}

export async function uploadTaskAttachment(taskId, jobId, file, user) {
  const { DriveFile, Job, Opportunity, Users } = db;
  const { Task } = await resolveByTaskId(taskId);
  const companyId = user?.company_id;
  const builderId = user?.builder_id;
  const userId = user?.users_id;

  const task = await Task.findByPk(taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  let leadId = null;
  if (jobId) {
    const job = await Job.findByPk(jobId, {
      include: [{ model: Opportunity, as: "opportunity" }],
    });
    leadId = job?.opportunity?.leads_id || null;
  }

  const ext = file.originalname.substring(file.originalname.lastIndexOf(".")).replace(".", "");
  const newFile = await DriveFile.create({
    company_id: companyId,
    builder_id: builderId,
    uploaded_by: userId,
    lead_id: leadId,
    reference_id: taskId,
    reference_type: "JobProcessTask",
    original_name: file.originalname,
    // multer-s3 named the object from the administrator-configured format; the
    // key's basename is that name. De-duplicate — file_name is UNIQUE.
    file_name: await ensureUniqueDriveFileName(file.key.split("/").pop()),
    s3_key: file.key,
    file_extension: ext,
    mime_type: file.mimetype,
    size: file.size,
  });

  // Append new file ID to task's attachments list
  const currentAttachments = Array.isArray(task.attachments) ? task.attachments : [];
  const updatedAttachments = [...currentAttachments, newFile.file_id];
  await task.update({ attachments: updatedAttachments });

  // Resolve and return updated list of attachments
  let driveFiles = [];
  if (updatedAttachments.length > 0) {
    driveFiles = await DriveFile.findAll({
      where: { file_id: { [Op.in]: updatedAttachments } },
      include: [
        { model: Users, as: "uploadedByUser", attributes: ["name"] }
      ],
    });
  }

  const resolvedAttachments = await Promise.all(
    driveFiles.map(async (f) => {
      const sizeInMB = f.size ? `${(Number(f.size) / (1024 * 1024)).toFixed(1)} MB` : null;
      const presignedResult = await generatePresignedDownloadUrl(f.s3_key).catch(() => null);
      return {
        id: f.file_id,
        name: f.original_name,
        size: sizeInMB || undefined,
        url: presignedResult?.success ? presignedResult.url : null,
        createdAt: f.created_at,
        uploadedBy: f.uploadedByUser ? f.uploadedByUser.name : null,
      };
    })
  );

  return resolvedAttachments;
}

export async function deleteTaskAttachment(taskId, fileId, companyId) {
  const { DriveFile, Users } = db;
  const { Task } = await resolveByTaskId(taskId);

  const file = await DriveFile.findOne({
    where: {
      file_id: fileId,
      reference_id: taskId,
      reference_type: "JobProcessTask",
      company_id: companyId,
    },
  });

  if (!file) {
    throw new Error("Attachment not found");
  }

  await deleteFromS3(file.s3_key);
  await file.destroy();

  const task = await Task.findByPk(taskId);
  let updatedAttachments = [];
  if (task) {
    const currentAttachments = Array.isArray(task.attachments) ? task.attachments : [];
    updatedAttachments = currentAttachments.filter(id => id !== fileId);
    await task.update({ attachments: updatedAttachments });
  }

  // Resolve and return updated list of attachments
  let driveFiles = [];
  if (updatedAttachments.length > 0) {
    driveFiles = await DriveFile.findAll({
      where: { file_id: { [Op.in]: updatedAttachments } },
      include: [
        { model: Users, as: "uploadedByUser", attributes: ["name"] }
      ],
    });
  }

  const resolvedAttachments = await Promise.all(
    driveFiles.map(async (f) => {
      const sizeInMB = f.size ? `${(Number(f.size) / (1024 * 1024)).toFixed(1)} MB` : null;
      const presignedResult = await generatePresignedDownloadUrl(f.s3_key).catch(() => null);
      return {
        id: f.file_id,
        name: f.original_name,
        size: sizeInMB || undefined,
        url: presignedResult?.success ? presignedResult.url : null,
        createdAt: f.created_at,
        uploadedBy: f.uploadedByUser ? f.uploadedByUser.name : null,
      };
    })
  );

  return resolvedAttachments;
}

/**
 * EMAIL THE TASK'S SUPPLIER
 *
 * Sends the supplier doing the task a note that it is theirs, with the detail
 * they need to act on it (job, stage, duration, estimated date). Job tasks
 * only — a template task has no job to talk about and no supplier on it.
 *
 * Delivery is queued (see sendMail.service), so a success here means accepted
 * for sending rather than delivered.
 */
/**
 * Load a job task plus everything the supplier mail needs, with the ownership
 * check applied. Shared by the mail context (which composes the draft) and the
 * send itself, so the two can never disagree about the task.
 */
async function loadTaskForAssigneeMail(taskId, builderId, companyId) {
  const { JobProcessStage, Job } = db;
  const { Task, SubStage, isJob } = await resolveByTaskId(taskId);

  if (!isJob) {
    throw new Error("Only a job's tasks can be sent to a supplier");
  }

  const task = await Task.findByPk(taskId, {
    include: [
      { model: db.Role, as: "assignee", attributes: ["role_id", "name"] },
      { model: db.Service, as: "service", attributes: ["service_id", "service"] },
      {
        model: db.Supplier,
        as: "supplier",
        attributes: ["supplier_id", "company_name", "contact_name", "email"],
      },
      {
        model: SubStage,
        as: "subStage",
        attributes: ["sub_stage_id", "name"],
        include: [{
          model: JobProcessStage,
          as: "stage",
          attributes: ["stage_id", "name", "builder_id", "company_id"],
        }],
      },
    ],
  });

  if (!task) {
    throw new Error("Task not found");
  }
  if (task.subStage?.stage?.builder_id !== builderId && task.subStage?.stage?.company_id !== companyId) {
    throw new Error("You can only send your own tasks");
  }

  /* ---------------------------------------------------------------
     Who the mail goes to.

     The supplier, and only the supplier — the task is work handed to an
     outside firm, and the role/assignee on it are internal. A task with no
     supplier has nobody to write to at all: the caller is expected to assign
     one first, which is what the Assign Task step in front of this does.
  --------------------------------------------------------------- */
  if (!task.supplier) {
    throw new Error("Assign a supplier to this task before emailing it");
  }

  const assignee = {
    supplier_id: task.supplier.supplier_id,
    // Greeting the contact by name reads better than the company; the company
    // is the fallback because contact_name is optional.
    name: task.supplier.contact_name || task.supplier.company_name,
    email: task.supplier.email?.trim() || null,
  };

  if (!assignee.email) {
    throw new Error(`${task.supplier.company_name} has no email address on file`);
  }

  const job = await Job.findByPk(task.job_id, {
    attributes: ["job_id", "reference_number"],
  });

  return { task, job, assignee };
}

/**
 * What the "Email assignee" mail panel opens with: who it goes to, the saved
 * email templates, a prefilled subject and draft body, and the task's schedule.
 *
 * Returned rather than composed at send time so the sender reads and edits the
 * message that actually goes out — the same compose-then-send shape as the
 * structural engineer mail panel.
 */
export async function getAssigneeMailContext(taskId, builderId, companyId, user = null) {
  const { TemplateEmail } = db;
  const { task, job, assignee } = await loadTaskForAssigneeMail(taskId, builderId, companyId);

  const emailTemplates = await TemplateEmail.findAll({
    where: {
      is_active: true,
      [Op.or]: [
        ...(builderId ? [{ builder_id: builderId }] : []),
        ...(companyId ? [{ company_id: companyId }] : []),
      ],
    },
    attributes: ["template_email_id", "name", "subject", "email_content"],
    order: [["name", "ASC"]],
  });

  const jobRef = job?.reference_number ?? "";

  return {
    task_id: taskId,
    task_name: task.name,
    job_reference: jobRef,
    stage_name: task.subStage?.stage?.name ?? null,
    sub_stage_name: task.subStage?.name ?? null,
    // What the task covers, and the internal role owning it.
    service_name: task.service?.service ?? null,
    supplier_name: task.supplier.company_name,
    role_name: task.assignee?.name ?? null,
    duration_days: task.no_of_days ?? null,
    // The schedule the supplier is being held to.
    start_date: formatEmailDate(task.estimated_start_date),
    finish_date: formatEmailDate(task.estimated_end_date),
    actual_date: formatEmailDate(task.actual_date),
    assignee: {
      supplier_id: assignee.supplier_id,
      name: assignee.name,
      email: assignee.email,
    },
    default_subject: jobRef
      ? `Task assigned: ${task.name} (Job ${jobRef})`
      : `Task assigned: ${task.name}`,
    default_body: buildDefaultAssignmentBody({
      assigneeName: assignee.name,
      taskName: task.name,
      jobReference: jobRef,
      senderName: user?.name ?? "",
    }),
    email_templates: (emailTemplates || []).map((t) => ({
      template_email_id: t.template_email_id,
      name: t.name,
      subject: t.subject,
      email_content: t.email_content,
    })),
  };
}

/**
 * Send the assignee mail. `payload.email_body` is the message composed in the
 * panel; omitting it falls back to the generated wording so an API caller need
 * not compose one.
 */
export async function notifyTaskAssignee(taskId, builderId, companyId, user = null, payload = {}) {
  const { task, job, assignee } = await loadTaskForAssigneeMail(taskId, builderId, companyId);

  // "Add Days" lands the assignee on the public page where they ask for more
  // time. Only offered when the task has a duration to scale the cap from —
  // without one there is nothing to extend — and while extension chances are
  // left, so the button never leads to a page that refuses the request.
  const maxExtensionDays = maxExtensionDaysFor(task.no_of_days);
  const allowance = await getExtensionAllowance(taskId);
  const addDaysUrl = maxExtensionDays > 0 && allowance.left > 0 && env.EMAIL?.FRONTEND_BASE_URL
    ? `${env.EMAIL.FRONTEND_BASE_URL}/external?Type=taskadddays&id=${taskId}`
    : null;

  const composed = wrapTaskAssignmentHTML({
    assigneeName: assignee.name,
    taskName: task.name,
    jobReference: job?.reference_number ?? "",
    stageName: task.subStage?.stage?.name ?? "",
    subStageName: task.subStage?.name ?? "",
    serviceName: task.service?.service ?? "",
    roleName: task.assignee?.name ?? "",
    durationDays: task.no_of_days,
    startDate: formatEmailDate(task.estimated_start_date),
    finishDate: formatEmailDate(task.estimated_end_date),
    actualDate: formatEmailDate(task.actual_date),
    senderName: user?.name ?? null,
    bodyHtml: payload.email_body || null,
    addDaysUrl,
    maxExtensionDays: maxExtensionDays || null,
    extensionsLeft: allowance.left,
    extensionLimit: allowance.limit,
  });

  // The sender may have edited the subject in the popup; theirs wins.
  const subject = (payload.subject || "").trim() || composed.subject;

  // The popup's To field is editable, so send where they asked. Falling back to
  // the supplier keeps the plain "email the supplier" call working unchanged.
  const recipients = Array.isArray(payload.to) && payload.to.length
    ? [...new Set(payload.to.map((e) => String(e).trim()).filter(Boolean))]
    : [assignee.email];

  for (const to of recipients) {
    await sendEmail(to, subject, composed.text, composed.html);
  }

  return {
    task_id: taskId,
    to: recipients,
    assignee_name: assignee.name,
    subject,
  };
}

export default {
  createTaskService,
  updateTask,
  deleteTask,
  getTasks,
  getAssigneeMailContext,
  notifyTaskAssignee,
  createSubTask,
  updateSubTask,
  deleteSubTask,
  getSubTasks,
  getAllJobTasks,
  getAllTasksOnly,
  deleteTaskDependency,
  uploadTaskAttachment,
  deleteTaskAttachment,
};
