import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";
import { resolveImageUrls } from "../../helper/imageDriveFile.helper.js";

/**
 * CREATE FLOOR PLAN FACADE MAP
 */
export async function createFloorPlanFacadeMap(currentUser, payload) {
  const { floor_plan_id, facade_id } = payload;
  const builderId = currentUser.builder_id;
  const companyId = currentUser.company_id;

  const transaction = await db.sequelize.transaction();
  try {
    // 1. Validate floor plan exists and belongs to user's organization
    const floorPlan = await db.FloorPlan.findOne({
      where: {
        floor_plan_id,
        [db.Sequelize.Op.or]: [
          { company_id: companyId },
          { builder_id: builderId },
        ],
      },
      transaction,
    });

    if (!floorPlan) {
      const error = new Error("Floor plan not found or does not belong to your organization");
      error.status = 404;
      throw error;
    }

    // 2. Validate facade exists and belongs to user's organization
    const facade = await db.Facade.findOne({
      where: {
        facade_id,
        [db.Sequelize.Op.or]: [
          { company_id: companyId },
          { builder_id: builderId },
        ],
      },
      transaction,
    });

    if (!facade) {
      const error = new Error("Facade not found or does not belong to your organization");
      error.status = 404;
      throw error;
    }

    // 3. Check for duplicate mapping
    const existing = await db.FloorPlanFacadeMap.findOne({
      where: { floor_plan_id, facade_id },
      transaction,
    });

    if (existing) {
      if (existing.is_sample_data) {
        await existing.update({ is_sample_data: false }, { transaction });
        await transaction.commit();

        const mappingWithFacade = await db.FloorPlanFacadeMap.findByPk(existing.id, {
          include: [
            {
              model: db.Facade,
              as: "facade",
              required: true,
            },
          ],
        });

        if (mappingWithFacade?.facade) {
          await resolveImageUrls(mappingWithFacade.facade, ["image"], db.sequelize);
        }

        const plain = mappingWithFacade.get({ plain: true });

        return keysToCamelCase({
          id: plain.id,
          floorPlanId: plain.floor_plan_id,
          facadeId: plain.facade_id,
          facade: plain.facade,
          createdAt: plain.createdAt || null,
        });
      }

      const error = new Error("This floor plan is already mapped to this facade");
      error.status = 409;
      throw error;
    }

    // 4. Create the mapping
    const mapping = await db.FloorPlanFacadeMap.create(
      { floor_plan_id, facade_id },
      { transaction }
    );

    await transaction.commit();

    const mappingWithFacade = await db.FloorPlanFacadeMap.findByPk(mapping.id, {
      include: [
        {
          model: db.Facade,
          as: "facade",
          required: true,
        },
      ],
    });

    if (mappingWithFacade?.facade) {
      await resolveImageUrls(mappingWithFacade.facade, ["image"], db.sequelize);
    }

    const plain = mappingWithFacade.get({ plain: true });

    return keysToCamelCase({
      id: plain.id,
      floorPlanId: plain.floor_plan_id,
      facadeId: plain.facade_id,
      facade: plain.facade,
      createdAt: plain.createdAt || null,
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

/**
 * GET ALL FLOOR PLAN FACADE MAPS
 */
export async function getFloorPlanFacadeMaps(currentUser, filters = {}) {
  const { floor_plan_id, facade_id, page = 1, limit = 25 } = filters;
  const pageValue = parseInt(page, 10) || 1;
  const limitValue = parseInt(limit, 10) || 25;
  const offset = (pageValue - 1) * limitValue;

  const { Op } = db.Sequelize;
  const builderId = currentUser.builder_id;
  const companyId = currentUser.company_id;

  const where = {};
  if (floor_plan_id) {
    where.floor_plan_id = floor_plan_id;
  }
  if (facade_id) {
    where.facade_id = facade_id;
  }

  const { count, rows } = await db.FloorPlanFacadeMap.findAndCountAll({
    where,
    include: [
      {
        model: db.FloorPlan,
        as: "floorPlan",
        attributes: ["builder_id", "company_id"],
        required: true,
        where: {
          [Op.or]: [
            { company_id: companyId },
            { builder_id: builderId },
          ],
        },
      },
      {
        model: db.Facade,
        as: "facade",
        required: true,
      },
    ],
    order: [["created_at", "DESC"]],
    limit: limitValue,
    offset,
  });

  const facadeInstances = rows.map((row) => row.facade).filter(Boolean);
  await resolveImageUrls(facadeInstances, ["image"], db.sequelize);

  const mappings = rows.map((row) => {
    const plain = row.get({ plain: true });
    return {
      id: plain.id,
      floorPlanId: plain.floor_plan_id,
      facadeId: plain.facade_id,
      facade: plain.facade,
      // Hand-built literals never reach the model's toJSON, so the marker the
      // rest of the app relies on has to be carried explicitly. Without it the
      // UI could not tell a seeded mapping from a real one, and removing one
      // came back as a bare failure instead of the read-only refusal.
      is_sample_data: plain.is_sample_data === true,
      createdAt: plain.createdAt || null,
      updatedAt: plain.updatedAt || null,
    };
  });

  const totalPages = Math.ceil(count / limitValue);

  return {
    mappings: keysToCamelCase(mappings),
    pagination: {
      currentPage: pageValue,
      totalPages,
      totalRecords: count,
      limit: limitValue,
    },
  };
}

/**
 * DELETE FLOOR PLAN FACADE MAP
 */
export async function deleteFloorPlanFacadeMap(currentUser, id) {
  const builderId = currentUser.builder_id;
  const companyId = currentUser.company_id;

  const transaction = await db.sequelize.transaction();
  try {
    // 1. Verify existence and ownership
    const mapping = await db.FloorPlanFacadeMap.findOne({
      where: { id },
      include: [
        {
          model: db.FloorPlan,
          as: "floorPlan",
          required: true,
          where: {
            [db.Sequelize.Op.or]: [
              { company_id: companyId },
              { builder_id: builderId },
            ],
          },
        },
        {
          model: db.Facade,
          as: "facade",
          required: true,
          where: {
            [db.Sequelize.Op.or]: [
              { company_id: companyId },
              { builder_id: builderId },
            ],
          },
        },
      ],
      transaction,
    });

    if (!mapping) {
      const error = new Error("Floor plan facade mapping not found or does not belong to your organization");
      error.status = 404;
      throw error;
    }

    // 2. Delete the mapping
    await mapping.destroy({ transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

export default {
  createFloorPlanFacadeMap,
  getFloorPlanFacadeMaps,
  deleteFloorPlanFacadeMap,
};
