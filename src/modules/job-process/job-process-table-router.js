import db from "../../config/database/models/postgre-models/index.js";

/**
 * Job-specific workflow status isolation.
 *
 * Sub-stages and tasks can live in two parallel table families:
 *   - Global TEMPLATE tables: job_process_sub_stage / job_process_task /
 *     job_process_subtask / job_process_task_dependency
 *   - JOB-specific instance tables: job_sub_stage / job_task /
 *     job_subtask / job_task_dependency
 *
 * Because every row uses a globally-unique UUID, an entity id belongs to
 * exactly one family. These resolvers detect which family an id lives in and
 * return the matching model set, so the CRUD logic can stay identical and just
 * operate on whichever tables the id points at. The job-specific models reuse
 * the same association aliases (`tasks`, `subStage`, `subtasks`, `assignee`,
 * `taskDependencies`, `predecessorTask`) as the template models, so includes and
 * response mappers work unchanged for both.
 */

function templateSet() {
  return {
    isJob: false,
    SubStage: db.JobProcessSubStage,
    Task: db.JobProcessTask,
    Subtask: db.JobProcessSubtask,
    Dependency: db.JobProcessTaskDependency,
  };
}

function jobSet() {
  return {
    isJob: true,
    SubStage: db.JobSubStage,
    Task: db.JobTask,
    Subtask: db.JobSubtask,
    Dependency: db.JobTaskDependency,
  };
}

export { templateSet, jobSet };

/**
 * Resolve the model family for a given sub-stage id.
 */
export async function resolveBySubStageId(subStageId) {
  const found = await db.JobSubStage.findByPk(subStageId, { attributes: ["sub_stage_id"] });
  return found ? jobSet() : templateSet();
}

/**
 * Resolve the model family for a given task id.
 */
export async function resolveByTaskId(taskId) {
  const found = await db.JobTask.findByPk(taskId, { attributes: ["job_process_task_id"] });
  return found ? jobSet() : templateSet();
}

/**
 * Resolve the model family for a given sub-task id.
 */
export async function resolveBySubtaskId(subtaskId) {
  const found = await db.JobSubtask.findByPk(subtaskId, { attributes: ["job_process_subtask_id"] });
  return found ? jobSet() : templateSet();
}

export default {
  templateSet,
  jobSet,
  resolveBySubStageId,
  resolveByTaskId,
  resolveBySubtaskId,
};
