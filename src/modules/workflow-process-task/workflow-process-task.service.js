import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

const { Actions, Task, Users } = db;

const formatUserObject = (userRecord) => {
  if (!userRecord) {
    return null;
  }
  return {
    id: userRecord.users_id,
    name: userRecord.name || null,
  };
};

export async function getAllWorkFlowProcessTaskService({
  builderId,
  lead_id,
  workflow_process_id,
  parsedLimit,
  parsedOffset,
}) {
  try {
    // Step 1: Fetch action IDs for the given builder and lead
    const actions = await Actions.findAll({
      attributes: ["action_id"],
      where: {
        builder_id: builderId,
        lead_id,
        type: "TASK",
      },
    });

    if (!actions || actions.length === 0) {
      return [];
    }

    const actionIds = actions.map((a) => a.action_id);

    // Step 2: Fetch tasks with associated user records
    const tasks = await Task.findAll({
      where: {
        action_id: { [Op.in]: actionIds },
        is_deleted: false,
        is_workflow_process_task: true,
        workflow_process_id,
      },
      include: [
        {
          model: Users,
          as: "assignee", // Task.belongsTo(Users, { foreignKey: "assignee_id", as: "assignee" })
          attributes: ["users_id", "name"],
          required: false,
        },
        {
          model: Users,
          as: "createdByUser", // Task.belongsTo(Users, { foreignKey: "created_by", as: "createdByUser" })
          attributes: ["users_id", "name"],
          required: false,
        },
        {
          model: Users,
          as: "updatedByUser", // Task.belongsTo(Users, { foreignKey: "updated_by", as: "updatedByUser" })
          attributes: ["users_id", "name"],
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
      limit: parsedLimit,
      offset: parsedOffset,
    });

    // Step 3: Format the response
    const tasksWithUsers = tasks.map((task) => {
      const plain = task.get({ plain: true });
      return {
        ...plain,
        assignee: formatUserObject(plain.assignee),
        createdBy: formatUserObject(plain.createdByUser),
        updatedBy: formatUserObject(plain.updatedByUser),
        // Remove raw association objects from the response
        createdByUser: undefined,
        updatedByUser: undefined,
      };
    });

    return tasksWithUsers;
  } catch (error) {
    console.error("Get all workflow process task error:", error);
    throw error;
  }
}

export async function deleteWorkFlowProcessTaskService({ builderId, action_id }) {
  const transaction = await db.sequelize.transaction();
  try {
    // Step 1: Verify the task exists and belongs to this builder
    const action = await Actions.findOne({
      where: {
        builder_id: builderId,
        action_id,
        type: "TASK",
      },
      include: [
        {
          model: Task,
          as: "task",
          where: {
            is_workflow_process_task: true,
            is_deleted: false,
          },
          required: true,
        },
      ],
      transaction,
    });

    if (!action) {
      await transaction.rollback();
      const error = new Error("Workflow process task not found.");
      error.statusCode = 404;
      throw error;
    }

    // Step 2: Soft delete — mark is_deleted = true
    const [updateCount, [updatedTask]] = await Task.update(
      { is_deleted: true, updated_at: new Date() },
      {
        where: {
          action_id,
          is_workflow_process_task: true,
          is_deleted: false,
        },
        returning: true,
        transaction,
      },
    );

    if (updateCount === 0) {
      await transaction.rollback();
      const error = new Error("Workflow process task not found.");
      error.statusCode = 404;
      throw error;
    }
    // Step 3: Fetch the updated task with user associations
    const taskWithAssociations = await Task.findOne({
      where: { task_id: updatedTask.task_id },
      include: [
        {
          model: Users,
          as: "assignee",
          attributes: ["users_id", "name"],
          required: false,
        },
        {
          model: Users,
          as: "createdByUser",
          attributes: ["users_id", "name"],
          required: false,
        },
        {
          model: Users,
          as: "updatedByUser",
          attributes: ["users_id", "name"],
          required: false,
        },
      ],
      transaction,
    });

    await transaction.commit();
    // Step 4: Format the response
    const plain = taskWithAssociations.get({ plain: true });
    return {
      ...plain,
      assignee: formatUserObject(plain.assignee),
      createdBy: formatUserObject(plain.createdByUser),
      updatedBy: formatUserObject(plain.updatedByUser),
      createdByUser: undefined,
      updatedByUser: undefined,
    };
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error("Delete workflow process task error:", error);
    throw error;
  }
}
