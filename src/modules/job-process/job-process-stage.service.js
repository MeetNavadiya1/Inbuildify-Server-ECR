import db from "../../config/database/models/postgre-models/index.js";
import { ensureWorkflowStageByStageId } from "./job-process-workflow.guard.js";
import { Sequelize } from "sequelize";
import { generatePresignedDownloadUrl } from "../../service/s3.service.js";
import { resolveBySubStageId, templateSet, jobSet } from "./job-process-table-router.js";
import { resolveAssigneeUser } from "./job-process-task.service.js";
import {
  getWorkflowSettings,
  filterTasksForViewer,
  recalculateJobWorkflowDates,
} from "../job-workflow-setting/workflowSchedule.service.js";
import { evaluateJobAutomationSafely } from "../job/job-automation.service.js";
import {
  maxExtensionDaysFor,
  EXTENSION_STATUS,
} from "../job-workflow/job-task-extension.service.js";
import { env } from "../../config/env.config.js";

const { Op } = Sequelize;

/**
 * CREATE STAGE
 */
export async function createStage(companyId, builderId, payload) {
  const { JobProcessStage, JobProcessStageFunctionality } = db;

  return await db.sequelize.transaction(async (t) => {
    // 1. Duplicate check
    const existing = await JobProcessStage.findOne({
      where: {
        company_id: companyId,
        builder_id: builderId,
        name: payload.name,
      },
      transaction: t,
    });

    if (existing) {
      throw new Error(`Stage with name ${payload.name} already exists for this company/builder`);
    }

    // 2. Sort Order Logic
    const maxSortOrder = (await JobProcessStage.max("sort_order", {
      where: { company_id: companyId, builder_id: builderId },
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

    // Shift existing stages if sort_order is provided
    if (payload.sort_order !== undefined) {
      await JobProcessStage.increment("sort_order", {
        by: 1,
        where: {
          company_id: companyId,
          builder_id: builderId,
          sort_order: { [Op.gte]: payload.sort_order },
        },
        transaction: t,
      });
    }

    // 3. Create Stage
    const stage = await JobProcessStage.create({
      company_id: companyId,
      builder_id: builderId,
      name: payload.name,
      functionality_id: payload.functionality_id,
      sort_order: finalSortOrder,
      dependent_stage_id: payload.dependent_stage_id || null,
    }, { transaction: t });

    // 4. Fetch with relations for consistent response
    const stageData = await JobProcessStage.findByPk(stage.stage_id, {
      include: [
        { model: JobProcessStage, as: "dependentStage", attributes: ["stage_id", "name"] },
        { model: JobProcessStageFunctionality, as: "functionality", attributes: ["functionality_id", "name", "is_workflow"] },
      ],
      transaction: t,
    });

    const plain = stageData.get({ plain: true });

    return {
      stageId: plain.stage_id,
      name: plain.name,
      sortOrder: plain.sort_order,
      dependentStage: plain.dependentStage
        ? { id: plain.dependentStage.stage_id, name: plain.dependentStage.name }
        : null,
      functionality: {
        id: plain.functionality.functionality_id,
        name: plain.functionality.name,
      },
      isWorkflow: plain.functionality.is_workflow,
      companyId: plain.company_id,
      builderId: plain.builder_id,
      createdAt: plain.created_at,
      updatedAt: plain.updated_at,
    };
  });
}

/**
 * UPDATE STAGE
 */
export async function updateStage(stageId, payload, builderId, companyId) {
  const { JobProcessStage, JobProcessStageFunctionality } = db;

  return await db.sequelize.transaction(async (t) => {
    const stage = await JobProcessStage.findOne({
      where: { stage_id: stageId, builder_id: builderId, company_id: companyId },
      transaction: t,
    });

    if (!stage) {
      throw new Error("Stage not found");
    }

    // Duplicate check for name change
    if (payload.name && payload.name !== stage.name) {
      const duplicate = await JobProcessStage.findOne({
        where: {
          company_id: companyId,
          builder_id: builderId,
          name: payload.name,
          stage_id: { [Op.ne]: stageId },
        },
        transaction: t,
      });

      if (duplicate) {
        throw new Error(`Stage with name ${payload.name} already exists for this company/builder`);
      }
    }

    // Sort order rebalancing
    if (payload.sort_order !== undefined && payload.sort_order !== stage.sort_order) {
      const maxSortOrder = await JobProcessStage.max("sort_order", {
        where: { company_id: companyId, builder_id: builderId },
        transaction: t,
      });

      if (payload.sort_order < 1 || payload.sort_order > maxSortOrder) {
        throw new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder}.`);
      }

      const oldOrder = stage.sort_order;
      const newOrder = payload.sort_order;

      if (newOrder > oldOrder) {
        // Shift intermediate stages down
        await JobProcessStage.decrement("sort_order", {
          by: 1,
          where: {
            builder_id: builderId,
            company_id: companyId,
            sort_order: { [Op.gt]: oldOrder, [Op.lte]: newOrder },
            stage_id: { [Op.ne]: stageId },
          },
          transaction: t,
        });
      } else {
        // Shift intermediate stages up
        await JobProcessStage.increment("sort_order", {
          by: 1,
          where: {
            builder_id: builderId,
            company_id: companyId,
            sort_order: { [Op.lt]: oldOrder, [Op.gte]: newOrder },
            stage_id: { [Op.ne]: stageId },
          },
          transaction: t,
        });
      }
    }

    // Update Stage
    await stage.update({
      name: payload.name,
      sort_order: payload.sort_order,
      dependent_stage_id: payload.dependent_stage_id,
      functionality_id: payload.functionality_id,
      updated_at: new Date(),
    }, { transaction: t });

    // Fetch refreshed data
    const stageData = await JobProcessStage.findByPk(stageId, {
      include: [
        { model: JobProcessStage, as: "dependentStage", attributes: ["stage_id", "name"] },
        { model: JobProcessStageFunctionality, as: "functionality", attributes: ["functionality_id", "name", "is_workflow"] },
      ],
      transaction: t,
    });

    const plain = stageData.get({ plain: true });

    return {
      stageId: plain.stage_id,
      name: plain.name,
      sortOrder: plain.sort_order,
      dependentStage: plain.dependentStage
        ? { id: plain.dependentStage.stage_id, name: plain.dependentStage.name }
        : null,
      functionality: {
        id: plain.functionality.functionality_id,
        name: plain.functionality.name,
      },
      isWorkflow: plain.functionality.is_workflow,
      companyId: plain.company_id,
      builderId: plain.builder_id,
      updatedAt: plain.updated_at,
    };
  });
}

/**
 * DELETE STAGE
 */
export async function deleteStage(stageId, builderId, companyId) {
  const { JobProcessStage } = db;

  return await db.sequelize.transaction(async (t) => {
    const stage = await JobProcessStage.findOne({
      where: { stage_id: stageId, builder_id: builderId, company_id: companyId },
      transaction: t,
    });

    if (!stage) {
      throw new Error("Stage not found");
    }

    const deletedOrder = stage.sort_order;

    await stage.destroy({ transaction: t });

    // Rebalance sort orders for subsequent stages
    await JobProcessStage.decrement("sort_order", {
      by: 1,
      where: {
        company_id: companyId,
        builder_id: builderId,
        sort_order: { [Op.gt]: deletedOrder },
      },
      transaction: t,
    });
  });
}

export async function createSubStage(stageId, payload, jobId = null) {
  await ensureWorkflowStageByStageId(stageId);

  const { JobProcessStage } = db;
  // When a jobId is supplied the sub-stage is created in the job-specific table;
  // otherwise it is a global template sub-stage.
  const { SubStage, Task, Subtask, isJob } = jobId ? jobSet() : templateSet();
  const scope = isJob ? { job_id: jobId } : {};

  return await db.sequelize.transaction(async (t) => {
    const parentStage = await JobProcessStage.findByPk(stageId, { transaction: t });
    if (!parentStage) {
      throw new Error("Parent stage not found");
    }

    // Duplicate check
    const existing = await SubStage.findOne({
      where: { stage_id: stageId, name: payload.name, ...scope },
      transaction: t,
    });

    if (existing) {
      throw new Error(`Sub-stage with name ${payload.name} already exists for this stage`);
    }

    // Sort order rebalancing
    const maxSortOrder = (await SubStage.max("sort_order", {
      where: { stage_id: stageId, ...scope },
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
      await SubStage.increment("sort_order", {
        by: 1,
        where: {
          stage_id: stageId,
          sort_order: { [Op.gte]: payload.sort_order },
          ...scope,
        },
        transaction: t,
      });
    }

    const subStage = await SubStage.create({
      stage_id: stageId,
      name: payload.name,
      sort_order: finalSortOrder,
      ...(payload.is_synced !== undefined ? { is_synced: payload.is_synced } : {}),
      ...scope,
      // Mirror the parent stage's tenant onto the job-specific sub-stage.
      ...(isJob ? { builder_id: parentStage.builder_id, company_id: parentStage.company_id } : {}),
    }, { transaction: t });

    // An explicit sort order re-orders the existing sub-stages, which re-orders
    // the task chain behind them.
    if (isJob) {
      await recalculateJobWorkflowDates(jobId, { transaction: t });
    }

    return await fetchAndMapSingleSubStage(SubStage, Task, Subtask, subStage.sub_stage_id, t);
  });
}

export async function updateSubStage(subStageId, payload, builderId, companyId, user = null) {
  const { JobProcessStage } = db;
  const { SubStage, Task, Subtask, isJob } = await resolveBySubStageId(subStageId);

  // Captured inside the transaction so the Job Settings automations can be
  // evaluated once it has committed (see below).
  let automationJobId = null;

  const result = await db.sequelize.transaction(async (t) => {
    const subStage = await SubStage.findOne({
      where: { sub_stage_id: subStageId },
      include: [{
        model: JobProcessStage,
        as: "stage",
        where: { builder_id: builderId, company_id: companyId },
      }],
      transaction: t,
    });

    if (!subStage) {
      throw new Error("Sub-stage not found");
    }

    if (isJob) {
      automationJobId = subStage.job_id;
    }

    // Job-specific sub-stages share a stage_id across jobs, so scope sibling
    // queries by job as well.
    const siblingScope = isJob ? { stage_id: subStage.stage_id, job_id: subStage.job_id } : { stage_id: subStage.stage_id };

    // Duplicate check
    if (payload.name && payload.name !== subStage.name) {
      const duplicate = await SubStage.findOne({
        where: {
          ...siblingScope,
          name: payload.name,
          sub_stage_id: { [Op.ne]: subStageId },
        },
        transaction: t,
      });

      if (duplicate) {
        throw new Error(`Sub-stage with name ${payload.name} already exists for this stage`);
      }
    }

    // Sort order rebalancing
    if (payload.sort_order !== undefined && payload.sort_order !== subStage.sort_order) {
      const maxSortOrder = await SubStage.max("sort_order", {
        where: siblingScope,
        transaction: t,
      });

      if (payload.sort_order < 1 || payload.sort_order > maxSortOrder) {
        throw new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder}.`);
      }

      const oldOrder = subStage.sort_order;
      const newOrder = payload.sort_order;

      if (newOrder > oldOrder) {
        await SubStage.decrement("sort_order", {
          by: 1,
          where: {
            ...siblingScope,
            sort_order: { [Op.gt]: oldOrder, [Op.lte]: newOrder },
            sub_stage_id: { [Op.ne]: subStageId },
          },
          transaction: t,
        });
      } else {
        await SubStage.increment("sort_order", {
          by: 1,
          where: {
            ...siblingScope,
            sort_order: { [Op.lt]: oldOrder, [Op.gte]: newOrder },
            sub_stage_id: { [Op.ne]: subStageId },
          },
          transaction: t,
        });
      }
    }

    await subStage.update({
      name: payload.name,
      sort_order: payload.sort_order,
      is_completed: payload.is_completed,
      is_skipped: payload.is_skipped,
      ...(payload.is_synced !== undefined ? { is_synced: payload.is_synced } : {}),
      updated_at: new Date(),
    }, { transaction: t });

    // When marking a sub-stage as completed, complete all its tasks too
    if (payload.is_completed === true) {
      const settings = isJob
        ? await getWorkflowSettings({ builderId, companyId })
        : null;

      await Task.update(
        {
          is_completed: true,
          actual_date: new Date(),
          updated_at: new Date(),
          // Whether those actual dates immediately re-base the rest of the
          // chain is the "recalculate on actual date changes" setting.
          ...(isJob
            ? { actual_date_applied: !!settings.recalculate_estimated_dates_based_on_actual_changes }
            : {}),
        },
        { where: { sub_stage_id: subStageId }, transaction: t }
      );
    }

    // Re-ordering, skipping, un-syncing or completing a sub-stage all change
    // which tasks the chain runs through and when.
    if (isJob) {
      await recalculateJobWorkflowDates(subStage.job_id, { transaction: t });
    }

    return await fetchAndMapSingleSubStage(SubStage, Task, Subtask, subStageId, t);
  });

  // Completing or skipping the last open sub-stage of a stage is what
  // Settings → Job → Settings reacts to (move the job to maintenance / mark it
  // completed). Runs after the commit so the automation reads the settled
  // workflow, and never fails the update.
  if (isJob && (payload.is_completed !== undefined || payload.is_skipped !== undefined)) {
    await evaluateJobAutomationSafely(automationJobId, { user });
  }

  return result;
}

export async function deleteSubStage(subStageId, builderId, companyId, taskId = null) {
  const { JobProcessStage } = db;
  const models = await resolveBySubStageId(subStageId);
  const { SubStage, Task, isJob } = models;

  return await db.sequelize.transaction(async (t) => {
    const subStage = await SubStage.findOne({
      where: { sub_stage_id: subStageId },
      include: [{
        model: JobProcessStage,
        as: "stage",
        where: { builder_id: builderId, company_id: companyId },
      }],
      transaction: t,
    });

    if (!subStage) {
      throw new Error("Sub-stage not found");
    }

    const existingSortOrder = subStage.sort_order;
    const stageId = subStage.stage_id;
    // Sibling sub-stages live within the same stage (and, for job-specific
    // sub-stages, the same job).
    const siblingScope = isJob ? { stage_id: stageId, job_id: subStage.job_id } : { stage_id: stageId };

    // Fetch tasks in this sub-stage
    const tasks = await Task.findAll({
      where: { sub_stage_id: subStageId },
      order: [["sort_order", "ASC"]],
      transaction: t,
    });

    if (taskId) {
      // Logic for moving tasks to a specific task's parent sub-stage
      const targetTask = await Task.findByPk(taskId, { transaction: t });
      if (!targetTask) {
        throw new Error("Task not found");
      }

      const targetSubStageId = targetTask.sub_stage_id;
      const targetTaskSortOrder = targetTask.sort_order;

      // Shift target sub-stage tasks to make room
      await Task.increment("sort_order", {
        by: tasks.length,
        where: {
          sub_stage_id: targetSubStageId,
          sort_order: { [Op.gt]: targetTaskSortOrder },
        },
        transaction: t,
      });

      // Move tasks to target sub-stage
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        await task.update({
          sub_stage_id: targetSubStageId,
          sort_order: targetTaskSortOrder + 1 + i,
        }, { transaction: t });
      }
    } else {
      // General relocation to the neighbouring sub-stage
      await handleAllTaskRelocation(t, models, siblingScope, subStageId, existingSortOrder, tasks);
    }

    // Shift remaining sub-stages
    await SubStage.decrement("sort_order", {
      by: 1,
      where: {
        ...siblingScope,
        sort_order: { [Op.gt]: existingSortOrder },
      },
      transaction: t,
    });

    await subStage.destroy({ transaction: t });

    // The surviving tasks were relocated and re-sorted, so the chain is
    // different from here on.
    if (isJob) {
      await recalculateJobWorkflowDates(subStage.job_id, { transaction: t });
    }
  });
}

async function handleAllTaskRelocation(
  transaction,
  models,
  siblingScope,
  deletedSubStageId,
  deletedSortOrder,
  tasksToMove = null,
) {
  const { SubStage, Task, Dependency } = models;

  if (!tasksToMove) {
    tasksToMove = await Task.findAll({
      where: { sub_stage_id: deletedSubStageId },
      order: [["sort_order", "ASC"]],
      transaction,
    });
  }

  // Nothing to relocate: an empty sub-stage can always be deleted, including the
  // last one left on a stage.
  if (!tasksToMove.length) {
    return;
  }

  // Tasks move forward to the next sub-stage; when the deleted one is last, they
  // fall back to the nearest preceding sibling so they are never orphaned.
  let targetSubStage = await SubStage.findOne({
    where: {
      ...siblingScope,
      sub_stage_id: { [Op.ne]: deletedSubStageId },
      sort_order: { [Op.gt]: deletedSortOrder },
    },
    order: [["sort_order", "ASC"]],
    transaction,
  });

  if (!targetSubStage) {
    targetSubStage = await SubStage.findOne({
      where: {
        ...siblingScope,
        sub_stage_id: { [Op.ne]: deletedSubStageId },
        sort_order: { [Op.lte]: deletedSortOrder },
      },
      order: [["sort_order", "DESC"]],
      transaction,
    });
  }

  // The only sub-stage left on the stage: there is nowhere to relocate to, so
  // the tasks go with it. The sub-stage FK cascades tasks (and their subtasks /
  // extension requests) in both table families; dependency rows are cleared
  // explicitly because the template family has no FK constraint to cascade them,
  // and because tasks elsewhere may point at these ones as predecessors.
  if (!targetSubStage) {
    const doomedTaskIds = tasksToMove.map((task) => task.job_process_task_id);
    await Dependency.destroy({
      where: {
        [Op.or]: [
          { task_id: { [Op.in]: doomedTaskIds } },
          { predecessor_task_id: { [Op.in]: doomedTaskIds } },
        ],
      },
      transaction,
    });
    return;
  }

  const maxTaskSortOrder = (await Task.max("sort_order", {
    where: { sub_stage_id: targetSubStage.sub_stage_id },
    transaction,
  })) || 0;

  for (let i = 0; i < tasksToMove.length; i++) {
    const task = tasksToMove[i];
    await task.update({
      sub_stage_id: targetSubStage.sub_stage_id,
      sort_order: maxTaskSortOrder + i + 1,
    }, { transaction });
  }
}

export async function getJobProcess(companyId, builderId) {
  const { JobProcessStage, JobProcessSubStage, JobProcessTask, JobProcessSubtask, JobProcessTaskDependency, JobProcessStageFunctionality, DriveFile, Users } = db;

  const data = await JobProcessStage.findAll({
    where: { company_id: companyId, builder_id: builderId },
    include: [
      { model: JobProcessStageFunctionality, as: "functionality" },
      { model: JobProcessStage, as: "dependentStage", attributes: ["stage_id", "name"] },
      {
        model: JobProcessSubStage,
        as: "subStages",
        include: [
          {
            model: JobProcessTask,
            as: "tasks",
            include: [
              { model: JobProcessSubtask, as: "subtasks" },
              {
                model: JobProcessTaskDependency,
                as: "taskDependencies",
                include: [{ model: JobProcessTask, as: "predecessorTask", attributes: ["job_process_task_id", "name"] }],
              },
            ],
          },
        ],
      },
    ],
    order: [
      ["sort_order", "ASC"],
      [{ model: JobProcessSubStage, as: "subStages" }, "sort_order", "ASC"],
      [{ model: JobProcessSubStage, as: "subStages" }, { model: JobProcessTask, as: "tasks" }, "sort_order", "ASC"],
      [{ model: JobProcessSubStage, as: "subStages" }, { model: JobProcessTask, as: "tasks" }, { model: JobProcessSubtask, as: "subtasks" }, "sort_order", "ASC"],
    ],
  });

  const allFileIds = [];
  data.forEach((s) => {
    (s.subStages || []).forEach((ss) => {
      (ss.tasks || []).forEach((t) => {
        if (Array.isArray(t.attachments)) {
          allFileIds.push(...t.attachments);
        }
      });
    });
  });

  let driveFiles = [];
  if (allFileIds.length > 0) {
    driveFiles = await DriveFile.findAll({
      where: { file_id: { [Op.in]: allFileIds } },
      include: [{ model: Users, as: "uploadedByUser", attributes: ["name"] }],
    });
  }

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

  return data.map((s) => {
    const stage = s.get({ plain: true });
    return {
      stageId: stage.stage_id,
      name: stage.name,
      sortOrder: stage.sort_order,
      dependentStage: stage.dependentStage
        ? { id: stage.dependentStage.stage_id, name: stage.dependentStage.name }
        : null,
      functionality: {
        id: stage.functionality.functionality_id,
        name: stage.functionality.name,
        isWorkflow: stage.functionality.is_workflow,
      },
      subStages: (stage.subStages || []).map((ss) => ({
        subStageId: ss.sub_stage_id,
        name: ss.name,
        sortOrder: ss.sort_order,
        tasks: (ss.tasks || []).map((t) => ({
          taskId: t.job_process_task_id,
          name: t.name,
          sortOrder: t.sort_order,
          notify: t.notify,
          milestone: t.milestone,
          attachmentMandatory: t.attachment_mandatory,
          isCompleted: t.is_completed,
          actualDate: t.actual_date,
          notes: t.notes,
          attachments: Array.isArray(t.attachments)
            ? t.attachments.map((id) => fileMap[id]).filter(Boolean)
            : [],
          dependencies: (t.taskDependencies || []).map((d) => ({
            id: d.predecessor_task_id,
            name: d.predecessorTask?.name,
          })),
          subTasks: (t.subtasks || []).map((st) => ({
            subTaskId: st.job_process_subtask_id,
            name: st.name,
            sortOrder: st.sort_order,
          })),
        })),
      })),
    };
  });
}

export async function getStages(companyId, builderId) {
  const { JobProcessStage, JobProcessStageFunctionality } = db;

  const stages = await JobProcessStage.findAll({
    where: { company_id: companyId, builder_id: builderId },
    include: [
      { model: JobProcessStage, as: "dependentStage", attributes: ["stage_id", "name"] },
      { model: JobProcessStageFunctionality, as: "functionality", attributes: ["functionality_id", "name", "is_workflow"] },
    ],
    order: [["sort_order", "ASC"]],
  });

  return stages.map((s) => {
    const plain = s.get({ plain: true });
    return {
      stageId: plain.stage_id,
      name: plain.name,
      sortOrder: plain.sort_order,
      dependentStage: plain.dependentStage
        ? { id: plain.dependentStage.stage_id, name: plain.dependentStage.name }
        : null,
      functionality: {
        id: plain.functionality.functionality_id,
        name: plain.functionality.name,
      },
      isWorkflow: plain.functionality.is_workflow,
    };
  });
}

/**
 * Lazily clone a stage's global template sub-stages (with their tasks, subtasks
 * and intra-stage dependencies) into the job-specific tables for a job. Runs
 * inside the supplied transaction.
 */
async function cloneTemplateSubStagesToJob(stageId, jobId, builderId, companyId, t) {
  const {
    JobProcessSubStage, JobProcessTask, JobProcessSubtask, JobProcessTaskDependency,
    JobSubStage, JobTask, JobSubtask, JobTaskDependency,
  } = db;

  // Only synced template sub-stages are cloned into the job, and within each
  // only its synced tasks (is_synced defaults to true, so un-synced items are
  // the explicit opt-outs). A synced sub-stage with no synced tasks still
  // clones as an empty sub-stage.
  const templateSubStages = await JobProcessSubStage.findAll({
    where: { stage_id: stageId, is_synced: true },
    include: [
      {
        model: JobProcessTask,
        as: "tasks",
        required: false,
        where: { is_synced: true },
        include: [
          { model: JobProcessSubtask, as: "subtasks" },
          { model: JobProcessTaskDependency, as: "taskDependencies" },
        ],
      },
    ],
    order: [["sort_order", "ASC"]],
    transaction: t,
  });

  // Maps a template task id to its freshly-cloned job task id so dependencies
  // can be re-pointed at the job-specific tasks.
  const taskIdMap = {};

  for (const ss of templateSubStages) {
    const newSubStage = await JobSubStage.create({
      job_id: jobId,
      stage_id: stageId,
      builder_id: builderId,
      company_id: companyId,
      name: ss.name,
      sort_order: ss.sort_order,
      is_completed: false,
      is_skipped: false,
      is_synced: true,
    }, { transaction: t });

    for (const task of (ss.tasks || [])) {
      // The template has no job, so a Builder-role task carries no person on it.
      // Cloning into a job is the first point the builder is known, so resolve
      // the assignee here rather than copying the template's null across.
      const assigneeUserId = await resolveAssigneeUser(
        task.assignee_id,
        task.assignee_user_id,
        { jobId, transaction: t },
      );

      const newTask = await JobTask.create({
        job_id: jobId,
        sub_stage_id: newSubStage.sub_stage_id,
        builder_id: builderId,
        company_id: companyId,
        name: task.name,
        description: task.description,
        sort_order: task.sort_order,
        folder_id: task.folder_id,
        no_of_days: task.no_of_days,
        assignee_id: task.assignee_id,
        assignee_user_id: assigneeUserId,
        // The service/supplier on the template is already tenant-scoped, so it
        // is copied across as-is.
        service_id: task.service_id,
        supplier_id: task.supplier_id,
        notify: task.notify,
        milestone: task.milestone,
        attachment_mandatory: task.attachment_mandatory,
        is_completed: false,
        is_synced: true,
        actual_date: null,
        notes: null,
        attachments: null,
      }, { transaction: t });
      taskIdMap[task.job_process_task_id] = newTask.job_process_task_id;

      for (const st of (task.subtasks || [])) {
        await JobSubtask.create({
          job_id: jobId,
          job_process_task_id: newTask.job_process_task_id,
          builder_id: builderId,
          company_id: companyId,
          name: st.name,
          sort_order: st.sort_order,
        }, { transaction: t });
      }
    }
  }

  // Second pass: re-create dependencies, remapped onto the cloned job tasks.
  // Dependencies whose predecessor lives in another stage are skipped (their
  // predecessor task is not part of this stage's clone).
  for (const ss of templateSubStages) {
    for (const task of (ss.tasks || [])) {
      for (const dep of (task.taskDependencies || [])) {
        const newTaskId = taskIdMap[dep.task_id];
        const newPredId = taskIdMap[dep.predecessor_task_id];
        if (newTaskId && newPredId) {
          await JobTaskDependency.create({
            task_id: newTaskId,
            predecessor_task_id: newPredId,
          }, { transaction: t });
        }
      }
    }
  }
}

/**
 * Shared response mapper for the sub-stage list. Works for both the template
 * and job-specific model sets because they expose identical association aliases.
 *
 * `visibility` carries the tenant's workflow settings plus the viewer's role so
 * a job's tasks can be narrowed down when "Show all Tasks to all Roles" is off.
 * It is omitted for the template screens, which always list everything.
 */
async function mapSubStagesResponse(subStages, visibility = null) {
  const { Users, DriveFile } = db;

  // Extract all file IDs
  const allFileIds = [];
  subStages.forEach((ss) => {
    (ss.tasks || []).forEach((t) => {
      if (Array.isArray(t.attachments)) {
        allFileIds.push(...t.attachments);
      }
    });
  });

  let driveFiles = [];
  if (allFileIds.length > 0) {
    driveFiles = await DriveFile.findAll({
      where: { file_id: { [Op.in]: allFileIds } },
      include: [{ model: Users, as: "uploadedByUser", attributes: ["name"] }],
    });
  }

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

  /* ---------------------------------------------------------------
     Extension chances left per task, for the count shown on the mail icon.

     Only a job's tasks can be extended — a template row has no schedule — so
     the lookup is keyed off task rows that carry a job. One grouped count for
     every sub-stage in the response rather than a query per task.
  --------------------------------------------------------------- */
  const extensionLimit = env.WORKFLOW_TASK.EXTENSION_LIMIT;
  const jobTaskIds = [];
  subStages.forEach((ss) => {
    (ss.tasks || []).forEach((t) => {
      if (t.job_id) jobTaskIds.push(t.job_process_task_id);
    });
  });

  const extensionsUsedByTask = {};
  if (jobTaskIds.length) {
    const counts = await db.JobTaskExtensionRequest.findAll({
      attributes: [
        "task_id",
        [Sequelize.fn("COUNT", Sequelize.col("job_task_extension_request_id")), "used"],
      ],
      where: {
        task_id: { [Op.in]: jobTaskIds },
        status: EXTENSION_STATUS.APPROVED,
      },
      group: ["task_id"],
      raw: true,
    });
    counts.forEach((row) => {
      extensionsUsedByTask[row.task_id] = Number(row.used) || 0;
    });
  }

  return subStages.map((ss) => {
    const plain = ss.get({ plain: true });
    const visibleTasks = visibility
      ? filterTasksForViewer(plain.tasks || [], visibility.settings, visibility.viewer)
      : plain.tasks || [];

    return {
      subStageId: plain.sub_stage_id,
      stageId: plain.stage_id,
      name: plain.name,
      sortOrder: plain.sort_order,
      isCompleted: plain.is_completed,
      isSkipped: plain.is_skipped,
      isSynced: plain.is_synced,
      createdAt: plain.created_at,
      updatedAt: plain.updated_at,
      tasks: visibleTasks.map((t) => {
        // A task with no duration has nothing to scale an extension from, so it
        // cannot be extended at all — null, which the UI reads as "no count to
        // show" rather than "no chances left".
        const canExtend = !!t.job_id && maxExtensionDaysFor(t.no_of_days) > 0;
        const extensionsUsed = extensionsUsedByTask[t.job_process_task_id] ?? 0;

        return {
          jobProcessTaskId: t.job_process_task_id,
          name: t.name,
          description: t.description,
          sortOrder: t.sort_order,
          noOfDays: t.no_of_days,
          isSynced: t.is_synced,
          notify: t.notify,
          milestone: t.milestone,
          attachmentMandatory: t.attachment_mandatory,
          isCompleted: t.is_completed,
          actualDate: t.actual_date,
          // Only a job's own tasks carry a schedule; template rows have no anchor
          // date to chain from, so these stay undefined there.
          estimatedStartDate: t.estimated_start_date ?? null,
          estimatedEndDate: t.estimated_end_date ?? null,
          estimatedDateLocked: t.estimated_date_locked ?? false,
          actualDateApplied: t.actual_date_applied ?? false,
          notes: t.notes,
          // How many times this task may still be extended, for the count on the
          // mail icon. Null when it cannot be extended at all.
          extensionLimit: canExtend ? extensionLimit : null,
          extensionsUsed: canExtend ? extensionsUsed : null,
          extensionsLeft: canExtend ? Math.max(0, extensionLimit - extensionsUsed) : null,
          attachments: Array.isArray(t.attachments)
            ? t.attachments.map((id) => fileMap[id]).filter(Boolean)
            : [],
          assignee: t.assignee
            ? {
              id: t.assignee.role_id,
              name: t.assignee.name,
            }
            : null,
          // The person holding that role. Auto-resolved to the job's builder when
          // the role is Builder — see job-process-task.service.resolveAssigneeUser.
          assigneeUser: t.assigneeUser
            ? {
              id: t.assigneeUser.users_id,
              name: t.assigneeUser.name,
            }
            : null,
          // `service` is WHAT the task is; `supplier` is WHO is doing it. This
          // is the pair the workflow UI collects — the role/assignee above is
          // kept for rows assigned before the switch.
          service: t.service ? { id: t.service.service_id, name: t.service.service } : null,
          supplier: t.supplier
            ? { id: t.supplier.supplier_id, name: t.supplier.company_name }
            : null,
          subTasks: (t.subtasks || []).map((st) => ({
            subTaskId: st.job_process_subtask_id,
            name: st.name,
            sortOrder: st.sort_order,
          })),
        };
      }),
    };
  });
}

/**
 * Helper to fetch a single sub-stage with all tasks, assignees, and subtasks
 * and return the mapped response matching mapSubStagesResponse.
 */
async function fetchAndMapSingleSubStage(SubStage, Task, Subtask, subStageId, transaction = null) {
  const { Role } = db;
  const subStage = await SubStage.findByPk(subStageId, {
    include: [
      {
        model: Task,
        as: "tasks",
        required: false,
        include: [
          {
            model: Role,
            as: "assignee",
            attributes: ["role_id", "name"],
            required: false,
          },
          {
            model: db.Users,
            as: "assigneeUser",
            attributes: ["users_id", "name"],
            required: false,
          },
          {
            model: db.Service,
            as: "service",
            attributes: ["service_id", "service"],
            required: false,
          },
          {
            model: db.Supplier,
            as: "supplier",
            attributes: ["supplier_id", "company_name"],
            required: false,
          },
          {
            model: Subtask,
            as: "subtasks",
            required: false,
          },
        ],
      },
    ],
    order: [
      [{ model: Task, as: "tasks" }, "sort_order", "ASC"],
      [{ model: Task, as: "tasks" }, { model: Subtask, as: "subtasks" }, "sort_order", "ASC"],
    ],
    transaction,
  });

  if (!subStage) return null;
  const mapped = await mapSubStagesResponse([subStage]);
  return mapped[0];
}

export async function getSubStages(stageId, jobId = null, viewer = null) {
  const { JobProcessStage, JobProcessStageFunctionality, Role } = db;

  const stage = await JobProcessStage.findByPk(stageId, {
    include: [{ model: JobProcessStageFunctionality, as: "functionality" }],
  });

  if (!stage || !stage.functionality?.is_workflow) {
    throw new Error("Sub-stages allowed only for workflow stages");
  }

  // Pick the model family: job-specific instance tables when a jobId is given,
  // otherwise the global template tables.
  const { SubStage, Task, Subtask } = jobId ? jobSet() : templateSet();
  const where = jobId ? { stage_id: stageId, job_id: jobId } : { stage_id: stageId };

  // On-demand lazy initialization: clone templates into the job tables the
  // first time a job's sub-stages are requested.
  if (jobId) {
    const existingCount = await SubStage.count({ where });
    if (existingCount === 0) {
      await db.sequelize.transaction(async (t) => {
        // Re-check inside the transaction to avoid a double clone under races.
        const recount = await SubStage.count({ where, transaction: t });
        if (recount === 0) {
          // Mirror the stage's tenant onto the cloned job rows.
          await cloneTemplateSubStagesToJob(stageId, jobId, stage.builder_id, stage.company_id, t);
        }
      });
    }
  }

  // The workflow schedule is derived, so it is refreshed on read: flipping a
  // weekend/holiday toggle, adding a company holiday or editing a duration
  // shows up on the next load without sweeping every job. Covers all three
  // workflows — the chain spans every workflow stage of the job, not just the
  // one being requested.
  let visibility = null;
  if (jobId) {
    const settings = await getWorkflowSettings({
      builderId: stage.builder_id,
      companyId: stage.company_id,
    });
    await recalculateJobWorkflowDates(jobId, { settings });
    visibility = { settings, viewer };
  }

  const subStages = await SubStage.findAll({
    where,
    include: [
      {
        model: Task,
        as: "tasks",
        required: false,
        include: [
          {
            model: Role,
            as: "assignee",
            attributes: ["role_id", "name"],
            required: false,
          },
          {
            model: db.Users,
            as: "assigneeUser",
            attributes: ["users_id", "name"],
            required: false,
          },
          {
            model: db.Service,
            as: "service",
            attributes: ["service_id", "service"],
            required: false,
          },
          {
            model: db.Supplier,
            as: "supplier",
            attributes: ["supplier_id", "company_name"],
            required: false,
          },
          {
            model: Subtask,
            as: "subtasks",
            required: false,
          },
        ],
      },
    ],
    order: [
      ["sort_order", "ASC"],
      [{ model: Task, as: "tasks" }, "sort_order", "ASC"],
      [{ model: Task, as: "tasks" }, { model: Subtask, as: "subtasks" }, "sort_order", "ASC"],
    ],
  });

  return mapSubStagesResponse(subStages, visibility);
}

/**
 * Sync / un-sync a whole stage within a single job.
 *
 * Un-syncing (isSynced=false) is a reversible soft toggle: it flips `is_synced`
 * to false on every job sub-stage for the (job, stage) pair and cascades to all
 * their tasks, keeping the rows (and their completion status, notes and
 * attachments) so re-syncing restores them.
 *
 * Syncing (isSynced=true) reconciles the job with the master template: any
 * synced template sub-stage — and, within it, any synced template task — that
 * the job does not already have is cloned in, and every row for this stage is
 * (re-)marked synced. Existing rows (including custom, non-template ones and
 * their progress) are preserved; only genuinely missing template items are
 * added. Because job rows carry no back-reference to their source template row,
 * "already have" is matched on the (trimmed, case-insensitive) name.
 *
 * If the job has no rows for this stage yet (never initialized), the templates
 * are cloned first so there is a concrete, persisted state to toggle.
 */
export async function setJobStageSync(jobId, stageId, isSynced, builderId, companyId, viewer = null) {
  const {
    JobProcessStage, JobProcessStageFunctionality,
    JobProcessSubStage, JobProcessTask, JobProcessSubtask, JobProcessTaskDependency,
    JobSubStage, JobTask, JobSubtask, JobTaskDependency,
  } = db;

  const stage = await JobProcessStage.findOne({
    where: { stage_id: stageId, builder_id: builderId, company_id: companyId },
    include: [{ model: JobProcessStageFunctionality, as: "functionality" }],
  });

  if (!stage) {
    throw new Error("Stage not found");
  }
  if (!stage.functionality?.is_workflow) {
    throw new Error("Sync is allowed only for workflow stages");
  }

  const norm = (s) => (s || "").trim().toLowerCase();

  await db.sequelize.transaction(async (t) => {
    if (!isSynced) {
      // ---- UN-SYNC: flip everything off, keeping rows for reversibility. ----
      const existingCount = await JobSubStage.count({
        where: { stage_id: stageId, job_id: jobId },
        transaction: t,
      });
      if (existingCount === 0) {
        await cloneTemplateSubStagesToJob(stageId, jobId, stage.builder_id, stage.company_id, t);
      }

      await JobSubStage.update(
        { is_synced: false, updated_at: new Date() },
        { where: { stage_id: stageId, job_id: jobId }, transaction: t },
      );
      const subStages = await JobSubStage.findAll({
        where: { stage_id: stageId, job_id: jobId },
        attributes: ["sub_stage_id"],
        transaction: t,
      });
      const subStageIds = subStages.map((s) => s.sub_stage_id);
      if (subStageIds.length) {
        await JobTask.update(
          { is_synced: false, updated_at: new Date() },
          { where: { sub_stage_id: { [Op.in]: subStageIds } }, transaction: t },
        );
      }
      return;
    }

    // ---- SYNC: reconcile the job with the master template. ----
    const templateSubStages = await JobProcessSubStage.findAll({
      where: { stage_id: stageId, is_synced: true },
      include: [
        {
          model: JobProcessTask,
          as: "tasks",
          required: false,
          where: { is_synced: true },
          include: [
            { model: JobProcessSubtask, as: "subtasks" },
            { model: JobProcessTaskDependency, as: "taskDependencies" },
          ],
        },
      ],
      order: [["sort_order", "ASC"]],
      transaction: t,
    });

    const existingSubStages = await JobSubStage.findAll({
      where: { stage_id: stageId, job_id: jobId },
      include: [{ model: JobTask, as: "tasks", required: false }],
      transaction: t,
    });
    const existingSubByName = new Map();
    existingSubStages.forEach((ss) => existingSubByName.set(norm(ss.name), ss));

    // Template task id -> job task id, so dependencies can be remapped onto the
    // job's tasks (whether pre-existing or freshly cloned here).
    const taskIdMap = {};
    let maxSubOrder = existingSubStages.reduce((m, s) => Math.max(m, s.sort_order), 0);

    for (const tss of templateSubStages) {
      let jobSS = existingSubByName.get(norm(tss.name));

      if (!jobSS) {
        maxSubOrder += 1;
        jobSS = await JobSubStage.create({
          job_id: jobId,
          stage_id: stageId,
          builder_id: stage.builder_id,
          company_id: stage.company_id,
          name: tss.name,
          sort_order: maxSubOrder,
          is_completed: false,
          is_skipped: false,
          is_synced: true,
        }, { transaction: t });
        jobSS.tasks = [];
      }

      const existingTaskByName = new Map();
      (jobSS.tasks || []).forEach((tk) => existingTaskByName.set(norm(tk.name), tk));
      let maxTaskOrder = (jobSS.tasks || []).reduce((m, tk) => Math.max(m, tk.sort_order), 0);

      for (const ttask of (tss.tasks || [])) {
        let jobTask = existingTaskByName.get(norm(ttask.name));
        if (!jobTask) {
          maxTaskOrder += 1;
          // See the initial clone above: the builder is only known once the
          // template task lands on a job, so resolve the person here.
          const assigneeUserId = await resolveAssigneeUser(
            ttask.assignee_id,
            ttask.assignee_user_id,
            { jobId, transaction: t },
          );

          jobTask = await JobTask.create({
            job_id: jobId,
            sub_stage_id: jobSS.sub_stage_id,
            builder_id: stage.builder_id,
            company_id: stage.company_id,
            name: ttask.name,
            description: ttask.description,
            sort_order: maxTaskOrder,
            folder_id: ttask.folder_id,
            no_of_days: ttask.no_of_days,
            assignee_id: ttask.assignee_id,
            assignee_user_id: assigneeUserId,
            service_id: ttask.service_id,
            supplier_id: ttask.supplier_id,
            notify: ttask.notify,
            milestone: ttask.milestone,
            attachment_mandatory: ttask.attachment_mandatory,
            is_completed: false,
            is_synced: true,
            actual_date: null,
            notes: null,
            attachments: null,
          }, { transaction: t });

          for (const st of (ttask.subtasks || [])) {
            await JobSubtask.create({
              job_id: jobId,
              job_process_task_id: jobTask.job_process_task_id,
              builder_id: stage.builder_id,
              company_id: stage.company_id,
              name: st.name,
              sort_order: st.sort_order,
            }, { transaction: t });
          }
        }
        taskIdMap[ttask.job_process_task_id] = jobTask.job_process_task_id;
      }
    }

    // Mark every row for this stage synced — including custom (non-template)
    // sub-stages/tasks — so the whole stage reads as synced after the toggle.
    await JobSubStage.update(
      { is_synced: true, updated_at: new Date() },
      { where: { stage_id: stageId, job_id: jobId }, transaction: t },
    );
    const allSubStages = await JobSubStage.findAll({
      where: { stage_id: stageId, job_id: jobId },
      attributes: ["sub_stage_id"],
      transaction: t,
    });
    const allSubStageIds = allSubStages.map((s) => s.sub_stage_id);
    if (allSubStageIds.length) {
      await JobTask.update(
        { is_synced: true, updated_at: new Date() },
        { where: { sub_stage_id: { [Op.in]: allSubStageIds } }, transaction: t },
      );
    }

    // Re-create any intra-stage dependencies that are missing for the tasks we
    // just added (or matched). Dependencies whose predecessor is outside this
    // stage's clone are skipped, and existing ones are left untouched.
    for (const tss of templateSubStages) {
      for (const ttask of (tss.tasks || [])) {
        for (const dep of (ttask.taskDependencies || [])) {
          const newTaskId = taskIdMap[dep.task_id];
          const newPredId = taskIdMap[dep.predecessor_task_id];
          if (!newTaskId || !newPredId) continue;
          const exists = await JobTaskDependency.findOne({
            where: { task_id: newTaskId, predecessor_task_id: newPredId },
            transaction: t,
          });
          if (!exists) {
            await JobTaskDependency.create(
              { task_id: newTaskId, predecessor_task_id: newPredId },
              { transaction: t },
            );
          }
        }
      }
    }
  });

  // Return the refreshed sub-stage tree so the caller can update the UI in
  // place. Syncing changes which tasks are part of the chain, so this read also
  // re-derives the schedule.
  const subStages = await getSubStages(stageId, jobId, viewer);
  return {
    stageId,
    jobId,
    isSynced,
    subStages,
  };
}

export async function getStageFunctionalities() {
  const { JobProcessStageFunctionality } = db;

  const result = await JobProcessStageFunctionality.findAll({
    order: [["name", "ASC"]],
  });

  return result.map((f) => f.get({ plain: true }));
}

/**
 * Eagerly initialize a job's workflow by cloning every workflow stage's template
 * sub-stages (with tasks, subtasks and dependencies) into the job-specific
 * tables. Idempotent: stages already cloned for the job are skipped, so this is
 * safe to call at job creation and is also the backfill used by lazy init.
 *
 * Pass an existing `transaction` to make initialization atomic with job
 * creation; omit it to run in its own transaction.
 */
export async function initializeJobWorkflow(jobId, builderId, companyId, transaction = null) {
  const { JobProcessStage, JobProcessStageFunctionality, JobSubStage } = db;

  const run = async (t) => {
    const workflowStages = await JobProcessStage.findAll({
      where: { company_id: companyId, builder_id: builderId },
      include: [{
        model: JobProcessStageFunctionality,
        as: "functionality",
        where: { is_workflow: true },
        required: true,
        attributes: [],
      }],
      attributes: ["stage_id", "builder_id", "company_id"],
      transaction: t,
    });

    for (const stage of workflowStages) {
      const existing = await JobSubStage.count({
        where: { stage_id: stage.stage_id, job_id: jobId },
        transaction: t,
      });
      if (existing === 0) {
        await cloneTemplateSubStagesToJob(stage.stage_id, jobId, stage.builder_id, stage.company_id, t);
      }
    }

    // Give the freshly cloned tasks their estimated dates straight away, so the
    // schedule is there before the job is first opened.
    await recalculateJobWorkflowDates(jobId, { transaction: t });
  };

  if (transaction) {
    await run(transaction);
  } else {
    await db.sequelize.transaction(run);
  }
}

export default {
  createStage,
  updateStage,
  deleteStage,
  createSubStage,
  updateSubStage,
  deleteSubStage,
  getStages,
  getSubStages,
  getStageFunctionalities,
  getJobProcess,
  initializeJobWorkflow,
  setJobStageSync,
};
