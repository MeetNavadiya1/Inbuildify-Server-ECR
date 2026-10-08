import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Internal Helper: Fetch functionality details for stage(s)
 */
async function getFunctionalityForStage(functionalityIds, SalesProcessStageFunctionality) {
  if (!functionalityIds || functionalityIds.length === 0) {
    return [];
  }

  const functionalities = await SalesProcessStageFunctionality.findAll({
    attributes: ["functionality_id", "name"],
    where: { functionality_id: { [Op.in]: functionalityIds } },
  });

  return functionalities.map((f) => ({
    id: f.functionality_id,
    name: f.name,
  }));
}

/**
 * Internal Helper: Format a stage row with functionality array and camelCasing
 */
async function formatStageWithFunctionality(stage, SalesProcessStageFunctionality) {
  if (!stage) {
    return null;
  }
  const plain = typeof stage.toJSON === "function" ? stage.toJSON() : stage;
  const functionality = await getFunctionalityForStage(
    plain.functionality_id,
    SalesProcessStageFunctionality,
  );
  const { functionality_id, ...rest } = plain;
  return keysToCamelCase({ ...rest, functionality });
}

/**
 * Create a new Sales Stage
 */
export async function createSalesStageService(payload, user) {
  const { SalesStage, SalesProcess, SalesProcessStageFunctionality, sequelize } = db;
  const builderId = user?.builder_id;
  const userId = user?.user_id;

  const {
    sales_process_id,
    stage_name,
    functionality_id,
    category,
    sort_order,
    is_active,
  } = payload;

  const result = await sequelize.transaction(async (t) => {
    // Validate sales process belongs to builder
    const validProcess = await SalesProcess.findOne({
      where: { sales_process_id, builder_id: builderId },
      transaction: t,
    });

    if (!validProcess) {
      const error = new Error("Invalid sales process for this builder.");
      error.statusCode = 400;
      throw error;
    }

    // Check duplicate stage name
    const existing = await SalesStage.findOne({
      where: { sales_process_id, stage_name: stage_name.trim() },
      transaction: t,
    });

    if (existing) {
      const error = new Error("Stage name already exists for this sales process.");
      error.statusCode = 400;
      throw error;
    }

    // Validate functionality_ids
    if (Array.isArray(functionality_id) && functionality_id.length > 0) {
      const validFuncs = await SalesProcessStageFunctionality.findAll({
        where: { functionality_id: { [Op.in]: functionality_id } },
        transaction: t,
      });

      if (validFuncs.length !== functionality_id.length) {
        const error = new Error("One or more functionality_id values are invalid.");
        error.statusCode = 400;
        throw error;
      }
    }

    // Get max sort_order for range validation
    const maxSortOrder = (await SalesStage.max("sort_order", {
      where: { sales_process_id },
      transaction: t,
    })) || 0;

    let finalSortOrder = sort_order;
    if (finalSortOrder == null) {
      finalSortOrder = maxSortOrder + 1;
    }

    if (finalSortOrder < 1 || finalSortOrder > maxSortOrder + 1) {
      const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`);
      error.statusCode = 400;
      throw error;
    }

    // Shift existing sort orders up to make room
    if (finalSortOrder <= maxSortOrder) {
      await SalesStage.increment("sort_order", {
        by: 1,
        where: {
          sales_process_id,
          sort_order: { [Op.gte]: finalSortOrder },
        },
        transaction: t,
      });
    }

    const created = await SalesStage.create(
      {
        sales_process_id,
        stage_name: stage_name.trim(),
        functionality_id: functionality_id || [],
        category,
        sort_order: finalSortOrder,
        is_active: is_active ?? true,
        created_by: userId,
        updated_by: userId,
      },
      { transaction: t },
    );

    return created;
  });

  return await formatStageWithFunctionality(result, SalesProcessStageFunctionality);
}

/**
 * Fetch all Sales Stages for a builder
 */
export async function getAllSalesStagesService(builderId) {
  const { SalesStage, SalesProcess, SalesProcessStageFunctionality } = db;

  const stages = await SalesStage.findAll({
    include: [
      {
        model: SalesProcess,
        as: "salesProcess",
        where: { builder_id: builderId },
        attributes: [],
      },
    ],
    order: [["sort_order", "ASC"]],
  });

  return await Promise.all(
    stages.map((s) => formatStageWithFunctionality(s, SalesProcessStageFunctionality)),
  );
}

/**
 * Delete a Sales Stage
 */
export async function deleteSalesStageService(salesStageId, builderId) {
  const { SalesStage, SalesProcess, sequelize } = db;

  await sequelize.transaction(async (t) => {
    // Verify ownership via join with sales_process
    const stage = await SalesStage.findOne({
      include: [
        {
          model: SalesProcess,
          as: "salesProcess",
          where: { builder_id: builderId },
          attributes: ["sales_process_id"],
        },
      ],
      where: { sales_stage_id: salesStageId },
      transaction: t,
    });

    if (!stage) {
      const error = new Error("Sales stage not found or you don't have permission to delete it.");
      error.statusCode = 404;
      throw error;
    }

    const deletedSortOrder = stage.sort_order;
    const salesProcessId = stage.sales_process_id;

    // ── 1. Delete the record ──────────────────────────────────────────────────
    await stage.destroy({ transaction: t });

    // ── 2. Shift sort_order down for all records above deleted position ───────
    await SalesStage.increment("sort_order", {
      by: -1,
      where: {
        sales_process_id: salesProcessId,
        sort_order: { [Op.gt]: deletedSortOrder },
      },
      transaction: t,
    });
  });

  return true;
}

/**
 * Update a Sales Stage
 */
export async function updateSalesStageService(salesStageId, payload, user) {
  const { SalesStage, SalesProcess, SalesProcessStageFunctionality, sequelize } = db;

  const builderId = user?.builder_id;
  const userId = user?.user_id;

  const { stage_name, functionality_id, category, sort_order, is_active } = payload;

  const result = await sequelize.transaction(async (t) => {
    // Find stage and verify builder ownership
    const stage = await SalesStage.findOne({
      include: [
        {
          model: SalesProcess,
          as: "salesProcess",
          where: { builder_id: builderId },
          attributes: ["sales_process_id"],
        },
      ],
      where: { sales_stage_id: salesStageId },
      transaction: t,
    });

    if (!stage) {
      const error = new Error("Sales stage not found for this builder.");
      error.statusCode = 404;
      throw error;
    }

    if (!stage.is_active && is_active === undefined) {
      const error = new Error("Inactive sales stage.");
      error.statusCode = 404;
      throw error;
    }

    const salesProcessId = stage.sales_process_id;

    // Check duplicate stage name
    if (stage_name) {
      const duplicate = await SalesStage.findOne({
        where: {
          sales_process_id: salesProcessId,
          sales_stage_id: { [Op.ne]: salesStageId },
          stage_name: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("stage_name")),
            stage_name.trim().toLowerCase(),
          ),
        },
        transaction: t,
      });

      if (duplicate) {
        const error = new Error("Stage name already exists.");
        error.statusCode = 400;
        throw error;
      }
    }

    // Validate functionality_ids
    if (functionality_id !== undefined) {
      if (!Array.isArray(functionality_id)) {
        const error = new Error("functionality_id must be an array of UUIDs.");
        error.statusCode = 400;
        throw error;
      }

      if (functionality_id.length > 0) {
        const validFuncs = await SalesProcessStageFunctionality.findAll({
          where: { functionality_id: { [Op.in]: functionality_id } },
          transaction: t,
        });

        if (validFuncs.length !== functionality_id.length) {
          const error = new Error("One or more functionality_id values are invalid.");
          error.statusCode = 400;
          throw error;
        }
      }
    }

    // Handle sort_order reordering
    if (sort_order !== undefined && sort_order !== null) {
      const maxSortOrder = (await SalesStage.max("sort_order", {
        where: { sales_process_id: salesProcessId },
        transaction: t,
      })) || 0;

      if (sort_order < 1 || sort_order > maxSortOrder + 1) {
        const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`);
        error.statusCode = 400;
        throw error;
      }

      const existingSortOrder = stage.sort_order;

      if (sort_order !== existingSortOrder) {
        if (sort_order > existingSortOrder) {
          // Moving down — shift records between old and new position up
          await SalesStage.increment("sort_order", {
            by: -1,
            where: {
              sales_process_id: salesProcessId,
              sales_stage_id: { [Op.ne]: salesStageId },
              sort_order: { [Op.gt]: existingSortOrder, [Op.lte]: sort_order },
            },
            transaction: t,
          });
        } else {
          // Moving up — shift records between new and old position down
          await SalesStage.increment("sort_order", {
            by: 1,
            where: {
              sales_process_id: salesProcessId,
              sales_stage_id: { [Op.ne]: salesStageId },
              sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSortOrder },
            },
            transaction: t,
          });
        }
      }
    }

    await stage.update(
      {
        ...(stage_name !== undefined && { stage_name: stage_name.trim() }),
        ...(functionality_id !== undefined && { functionality_id }),
        ...(category !== undefined && { category }),
        ...(sort_order !== undefined && { sort_order }),
        ...(is_active !== undefined && { is_active }),
        updated_by: userId,
      },
      { transaction: t },
    );

    return stage;
  });

  return await formatStageWithFunctionality(result, SalesProcessStageFunctionality);
}

/**
 * Update Sales Stage Active Status
 */
export async function updateSalesStageIsActiveService(salesStageId, isActive, user) {
  const { SalesStage, SalesProcess, sequelize } = db;
  const builderId = user?.builder_id;
  const userId = user?.user_id;

  const result = await sequelize.transaction(async (t) => {
    const stage = await SalesStage.findOne({
      include: [
        {
          model: SalesProcess,
          as: "salesProcess",
          where: { builder_id: builderId },
          attributes: [],
        },
      ],
      where: { sales_stage_id: salesStageId },
      transaction: t,
    });

    if (!stage) {
      const error = new Error("Sales stage not found for this builder.");
      error.statusCode = 404;
      throw error;
    }

    await stage.update({ is_active: isActive, updated_by: userId }, { transaction: t });

    return stage;
  });

  return keysToCamelCase(result.toJSON());
}

/**
 * Get Sales Stages by Sales Process ID
 */
export async function getSalesStagesBySalesProcessIdService(salesProcessId, builderId, companyId) {
  const { SalesStage, SalesProcess, SalesProcessStageFunctionality, sequelize } = db;

  const result = await sequelize.transaction(async (t) => {
    // Validate process belongs to this user
    const validProcess = await SalesProcess.findOne({
      where: {
        sales_process_id: salesProcessId,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      transaction: t,
    });

    if (!validProcess) {
      const error = new Error("Sales process not found for this user.");
      error.statusCode = 404;
      throw error;
    }

    const stages = await SalesStage.findAll({
      where: { sales_process_id: salesProcessId },
      order: [["sort_order", "ASC"]],
      transaction: t,
    });

    return stages;
  });

  return await Promise.all(
    result.map((s) => formatStageWithFunctionality(s, SalesProcessStageFunctionality)),
  );
}

export default {
  createSalesStageService,
  getAllSalesStagesService,
  updateSalesStageService,
  updateSalesStageIsActiveService,
  deleteSalesStageService,
  getSalesStagesBySalesProcessIdService,
};
