import { fn, col, literal, Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

// formatUserObject takes (userId, usersMap) — used for services where
// WorkflowProcess has no direct Users association (no created_by column on model)
const formatUserObject = (userId, usersMap) => {
  

  if (!userId) return null;
  return {
    id: userId,
    name: usersMap[userId] || null,
  };
};

const getUsersDetails = async (userIds) => {
  const { WorkflowProcess, WorkflowProcessTask, Users } = db;
  const validUserIds = userIds.filter(Boolean);
  if (validUserIds.length === 0) {
    return {};
  }

  const users = await Users.findAll({
    attributes: ["users_id", "name"],
    where: { users_id: validUserIds },
  });

  return users.reduce((acc, user) => {
    acc[user.users_id] = user.name;
    return acc;
  }, {});
};

// ─── WorkflowProcess Services ────────────────────────────────────────────────

export async function getAllWorkFlowProcessService({ builderId, parsedLimit, parsedOffset }) {
  const { WorkflowProcess, WorkflowProcessTask, Users } = db;
  try {
    // WorkflowProcess has no created_by/updated_by columns and no Users association,
    // so we fetch workflows as-is with no user enrichment
    const { rows: workflows, count: totalItems } = await WorkflowProcess.findAndCountAll({
      where: {
        builder_id: builderId,
        is_deleted: false,
      },
      order: [["display_order", "ASC"]],
      limit: parsedLimit,
      offset: parsedOffset,
    });

    const workflowProcesses = workflows.map((workflow) => workflow.get({ plain: true }));

    const totalPages = Math.ceil(totalItems / parsedLimit);
    const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;

    return {
      workflowProcesses,
      pagination: {
        totalItems,
        totalPages,
        currentPage,
        limit: parsedLimit,
      },
    };
  } catch (error) {
    console.error("Get all workflow process service error:", error);
    throw error;
  }
}

export async function createWorkFlowProcessService({ name, description, builderId, userId }) {
  const { WorkflowProcess, WorkflowProcessTask, Users } = db;
  try {
    // Step 1: Check if workflow process name already exists for this builder
    const existing = await WorkflowProcess.findOne({
      where: {
        name,
        builder_id: builderId,
        is_deleted: false,
        is_sample_data: false,
      },
    });

    if (existing) {
      const error = new Error("Workflow process name already exists.");
      error.statusCode = 400;
      throw error;
    }

    // Step 2: Calculate the next display_order
    const maxOrderResult = await WorkflowProcess.findOne({
      attributes: [
        [fn("COALESCE", fn("MAX", col("display_order")), literal("0")), "max_order"],
      ],
      where: { builder_id: builderId },
      raw: true,
    });

    const displayOrder = parseInt(maxOrderResult?.max_order ?? 0, 10) + 1;

    // Step 3: Create the workflow process
    // Note: WorkflowProcess model has no created_by/updated_by columns
    const workflow = await WorkflowProcess.create({
      builder_id: builderId,
      name,
      description: description || null,
      display_order: displayOrder,
    });

    // Step 4: Fetch user details for the response using userId
    const usersMap = await getUsersDetails([userId]);

    // Step 5: Format and return the response
    const plain = workflow.get({ plain: true });
    return {
      ...plain,
      createdBy: formatUserObject(userId, usersMap),
      updatedBy: formatUserObject(userId, usersMap),
    };
  } catch (error) {
    console.error("Create workflow process service error:", error);
    throw error;
  }
}

export async function updateWorkFlowProcessService({ id, name, description, builderId, userId }) {
  const { WorkflowProcess, WorkflowProcessTask, Users } = db;
  try {
    // Step 1: Find the workflow process to confirm it exists and belongs to this builder
    const workflow = await WorkflowProcess.findOne({
      where: {
        workflow_process_id: id,
        builder_id: builderId,
        is_deleted: false,
      },
    });

    if (!workflow) {
      const error = new Error("Workflow process not found or already deleted.");
      error.statusCode = 404;
      throw error;
    }

    // Step 2: Apply COALESCE logic — only update fields that are provided
    await workflow.update({
      name: name ?? workflow.name,
      description: description ?? workflow.description,
    });

    // Step 3: Fetch user details for the response
    // Note: WorkflowProcess model has no created_by/updated_by columns,
    // so we use the current userId for both createdBy and updatedBy
    const usersMap = await getUsersDetails([userId]);

    // Step 4: Format and return the response
    const plain = workflow.get({ plain: true });
    return {
      ...plain,
      createdBy: formatUserObject(userId, usersMap),
      updatedBy: formatUserObject(userId, usersMap),
    };
  } catch (error) {
    console.error("Update workflow process service error:", error);
    throw error;
  }
}

export async function displayOrderManageService({ orderedWorkflowProcess, builderId }) {
  const { WorkflowProcess, WorkflowProcessTask, Users } = db;
  const transaction = await db.sequelize.transaction();
  try {
    const workflowProcessIds = orderedWorkflowProcess.map((c) => c.workflowProcessId);

    // Step 1: Validate all provided IDs exist and belong to this builder
    const existingWorkflowProcesses = await WorkflowProcess.findAll({
      attributes: ["workflow_process_id"],
      where: {
        builder_id: builderId,
        is_deleted: false,
        workflow_process_id: { [Op.in]: workflowProcessIds },
      },
      transaction,
    });

    const validIds = existingWorkflowProcesses.map((c) => c.workflow_process_id);
    const invalidIds = workflowProcessIds.filter((id) => !validIds.includes(id));

    if (invalidIds.length > 0) {
      await transaction.rollback();
      const error = new Error(`Invalid or deleted workflow processes: ${invalidIds.join(", ")}`);
      error.statusCode = 400;
      throw error;
    }

    // Step 2: Update each workflow process display_order individually within the transaction
    // Sequelize does not support CASE-based bulk updates natively, so we run
    // parallel updates — still all within the same transaction for atomicity
    await Promise.all(
      orderedWorkflowProcess.map(({ workflowProcessId, displayOrder }) =>
        WorkflowProcess.update(
          { display_order: Number(displayOrder) },
          {
            where: {
              workflow_process_id: workflowProcessId,
              builder_id: builderId,
            },
            transaction,
          },
        ),
      ),
    );

    await transaction.commit();
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error("Display order manage service error:", error);
    throw error;
  }
}

export async function deleteWorkFlowProcessService({ id, builderId, userId }) {
  const { WorkflowProcess, WorkflowProcessTask, Users } = db;
  try {
    // Step 1: Verify the workflow process exists and belongs to this builder
    const workflow = await WorkflowProcess.findOne({
      where: {
        workflow_process_id: id,
        builder_id: builderId,
        is_deleted: false,
      },
    });

    if (!workflow) {
      const error = new Error("Workflow process not found or already deleted.");
      error.statusCode = 404;
      throw error;
    }

    // Step 2: Soft delete — mark is_deleted = true
    await workflow.update({ is_deleted: true });

    // Step 3: Fetch user details for the response
    // Note: WorkflowProcess model has no created_by/updated_by columns,
    // so userId is used for both createdBy and updatedBy in the response
    const usersMap = await getUsersDetails([userId]);

    // Step 4: Format and return the response
    const plain = workflow.get({ plain: true });
    return {
      ...plain,
      createdBy: formatUserObject(userId, usersMap),
      updatedBy: formatUserObject(userId, usersMap),
    };
  } catch (error) {
    console.error("Delete workflow process service error:", error);
    throw error;
  }
}

// ─── WorkflowProcessTask Services ────────────────────────────────────────────

export async function getWorkflowProcessesByCategoryIdService({ workflow_process_id, builderId }) {
  const { WorkflowProcess, WorkflowProcessTask, Users } = db;
  try {
    // Step 1: Verify the workflow process exists and belongs to this builder
    const workflowProcess = await WorkflowProcess.findOne({
      where: {
        workflow_process_id,
        builder_id: builderId,
        is_deleted: false,
      },
    });

    if (!workflowProcess) {
      const error = new Error("Workflow process not found.");
      error.statusCode = 404;
      throw error;
    }

    // Step 2: Fetch all tasks for this workflow process
    // Note: WorkflowProcessTask has no created_by/updated_by columns or Users association,
    // so tasks are returned as-is with no user enrichment
    const tasks = await WorkflowProcessTask.findAll({
      where: {
        workflow_process_id,
        is_deleted: false,
      },
      order: [["created_at", "DESC"]],
    });

    return tasks.map((t) => t.get({ plain: true }));
  } catch (error) {
    console.error("Get workflow process tasks service error:", error);
    throw error;
  }
}

export async function createWorkflowProcessTaskService({
  builderId,
  workflow_process_id,
  name,
  description,
  timespent,
  imageUrl,
}) {
  const { WorkflowProcess, WorkflowProcessTask, Users } = db;
  const transaction = await db.sequelize.transaction();
  try {
    // Step 1: Verify the workflow process exists and belongs to this builder
    const workflowProcess = await WorkflowProcess.findOne({
      where: {
        workflow_process_id,
        builder_id: builderId,
        is_deleted: false,
      },
      transaction,
    });

    if (!workflowProcess) {
      await transaction.rollback();
      const error = new Error("Workflow process not found.");
      error.statusCode = 404;
      throw error;
    }

    // Step 2: Check if task name already exists in this workflow process
    const existing = await WorkflowProcessTask.findOne({
      where: {
        workflow_process_id,
        name,
        is_deleted: false,
        is_sample_data: false,
      },
      transaction,
    });

    if (existing) {
      await transaction.rollback();
      const error = new Error("Task name already exists in this workflow process.");
      error.statusCode = 400;
      throw error;
    }

    // Step 3: Create the task
    // Note: WorkflowProcessTask model has no created_by_id/updated_by_id columns
    const task = await WorkflowProcessTask.create(
      {
        workflow_process_id,
        name,
        description: description || null,
        attachment: imageUrl || null,
        timespent: timespent || null,
      },
      { transaction },
    );

    await transaction.commit();

    return task.get({ plain: true });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error("Create workflow process task service error:", error);
    throw error;
  }
}

export async function updateWorkflowProcessTaskService({
  builderId,
  workflow_process_task_id,
  name,
  description,
  timespent,
  imageUrl,
}) {
  const { WorkflowProcess, WorkflowProcessTask, Users } = db;
  const transaction = await db.sequelize.transaction();
  try {
    // Step 1: Verify the task exists and its parent workflow process belongs to this builder
    const task = await WorkflowProcessTask.findOne({
      where: {
        workflow_process_task_id,
        is_deleted: false,
      },
      include: [
        {
          model: WorkflowProcess,
          as: "workflowProcess",
          where: { builder_id: builderId, is_deleted: false },
          attributes: ["workflow_process_id", "builder_id"],
          required: true,
        },
      ],
      transaction,
    });

    if (!task) {
      await transaction.rollback();
      const error = new Error("Workflow process task not found.");
      error.statusCode = 404;
      throw error;
    }

    // Step 2: Check for duplicate name if name is being updated
    if (name && name !== task.name) {
      const duplicate = await WorkflowProcessTask.findOne({
        where: {
          workflow_process_id: task.workflow_process_id,
          name,
          is_deleted: false,
          is_sample_data: false,
          workflow_process_task_id: { [Op.ne]: workflow_process_task_id },
        },
        transaction,
      });

      if (duplicate) {
        await transaction.rollback();
        const error = new Error("Task name already exists in this workflow process.");
        error.statusCode = 400;
        throw error;
      }
    }

    // Step 3: Build update payload — only include fields that are provided
    // Note: WorkflowProcessTask model has no updated_by_id column
    const updatePayload = {};
    if (name !== undefined) {
      updatePayload.name = name;
    }
    if (description !== undefined) {
      updatePayload.description = description;
    }
    if (timespent !== undefined) {
      updatePayload.timespent = timespent;
    }
    // Always update attachment: use new imageUrl if uploaded, otherwise keep existing
    updatePayload.attachment = imageUrl ?? task.attachment;

    // Step 4: Apply update if there are changes, otherwise return existing task as-is
    if (Object.keys(updatePayload).length > 0) {
      await task.update(updatePayload, { transaction });
    }

    await transaction.commit();

    return task.get({ plain: true });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error("Update workflow process task service error:", error);
    throw error;
  }
}

export async function deleteWorkflowProcessTaskService({ builderId, workflow_process_task_id }) {
  const { WorkflowProcess, WorkflowProcessTask, Users } = db;
  const transaction = await db.sequelize.transaction();
  try {
    // Step 1: Verify the task exists and its parent workflow process belongs to this builder
    const task = await WorkflowProcessTask.findOne({
      where: {
        workflow_process_task_id,
        is_deleted: false,
      },
      include: [
        {
          model: WorkflowProcess,
          as: "workflowProcess",
          where: { builder_id: builderId, is_deleted: false },
          attributes: ["workflow_process_id", "builder_id"],
          required: true,
        },
      ],
      transaction,
    });

    if (!task) {
      await transaction.rollback();
      const error = new Error("Workflow process task not found.");
      error.statusCode = 404;
      throw error;
    }

    // Step 2: Soft delete — mark is_deleted = true
    // Note: WorkflowProcessTask model has no updated_by_id column
    await task.update({ is_deleted: true }, { transaction });

    await transaction.commit();

    return task.get({ plain: true });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error("Delete workflow process task service error:", error);
    throw error;
  }
}
