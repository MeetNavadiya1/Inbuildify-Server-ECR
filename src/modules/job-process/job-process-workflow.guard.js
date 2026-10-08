import db from "../../config/database/models/postgre-models/index.js";

import { resolveBySubStageId } from "./job-process-table-router.js";

/**
 * Ensures the stage associated with the given stageId is a workflow stage.
 */
export async function ensureWorkflowStageByStageId(stageId) {
  const { JobProcessStage, JobProcessStageFunctionality } = db;

  const stage = await JobProcessStage.findOne({
    where: { stage_id: stageId },
    include: [
      {
        model: JobProcessStageFunctionality,
        as: "functionality",
        attributes: ["is_workflow"],
        required: true,
      },
    ],
  });

  if (!stage?.functionality?.is_workflow) {
    throw new Error("Operation allowed only for workflow stages");
  }
}

/**
 * Ensures the stage associated with the given subStageId is a workflow stage.
 */
export async function ensureWorkflowStageBySubStageId(subStageId) {
  const { JobProcessStage, JobProcessStageFunctionality } = db;
  const { SubStage } = await resolveBySubStageId(subStageId);

  const subStage = await SubStage.findOne({
    where: { sub_stage_id: subStageId },
    include: [
      {
        model: JobProcessStage,
        as: "stage",
        required: true,
        include: [
          {
            model: JobProcessStageFunctionality,
            as: "functionality",
            attributes: ["is_workflow"],
            required: true,
          },
        ],
      },
    ],
  });

  if (!subStage) {
    throw new Error("Sub-stage not found");
  }

  if (!subStage.stage?.functionality?.is_workflow) {
    throw new Error("Tasks allowed only under workflow stages");
  }
}

export default {
  ensureWorkflowStageByStageId,
  ensureWorkflowStageBySubStageId,
};
