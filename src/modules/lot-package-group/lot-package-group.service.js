import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

/**
 * Fetches all lot package groups with scoping and pagination.
 */
export const getAllLotPackageGroupsService = async ({ builderId, companyId, page, limit, search }) => {
  const { LotPackageGroup } = db;

  const offset = (page - 1) * limit;

  const where = {
    [Op.or]: [
      { company_id: companyId, company_id: { [Op.ne]: null } },
      { builder_id: builderId, builder_id: { [Op.ne]: null } },
    ],
  };

  if (search) {
    where.group_name = { [Op.iLike]: `%${search}%` };
  }

  const { count, rows } = await LotPackageGroup.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  return {
    groups: rows.map((row) => keysToCamelCase(row.get({ plain: true }))),
    totalCount: count,
  };
};

/**
 * Creates a new lot package group.
 */
export const createLotPackageGroupService = async (data, user) => {
  const { group_name } = data;
  const userId = user?.users_id;
  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  if (!userId || (!builderId && !companyId)) {
    const error = new Error("Unauthorized: User must belong to either a builder or company");
    error.status = 401;
    throw error;
  }

  const { LotPackageGroup } = db;

  const dupCheck = await LotPackageGroup.findOne({
    where: {
      [Op.and]: [
        db.sequelize.where(
          db.sequelize.fn("LOWER", db.sequelize.col("group_name")),
          group_name.toLowerCase(),
        ),
        {
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
      ],
    },
  });

  if (dupCheck) {
    const error = new Error("Group name already exists in your organization.");
    error.status = 400;
    throw error;
  }

  const result = await LotPackageGroup.create({
    company_id: companyId,
    builder_id: builderId,
    group_name,
    created_by: userId,
    updated_by: userId,
  });

  return result.get({ plain: true });
};

/**
 * Fetches a lot package group by ID.
 */
export const getLotPackageGroupByIdService = async (id, user) => {
  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  if (!builderId && !companyId) {
    const error = new Error("Unauthorized: User must belong to either a builder or company");
    error.status = 401;
    throw error;
  }

  const { LotPackageGroup } = db;

  const result = await LotPackageGroup.findOne({
    where: {
      lot_package_group_id: id,
      [Op.or]: [
        { company_id: companyId, company_id: { [Op.ne]: null } },
        { builder_id: builderId, builder_id: { [Op.ne]: null } },
      ],
    },
  });

  if (!result) {
    const error = new Error("Lot package group not found");
    error.status = 404;
    throw error;
  }

  return result.get({ plain: true });
};

/**
 * Updates a lot package group.
 */
export const updateLotPackageGroupService = async (id, data, user) => {
  const { group_name } = data;
  const userId = user?.users_id;
  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  if (!userId || (!builderId && !companyId)) {
    const error = new Error("Unauthorized");
    error.status = 401;
    throw error;
  }

  const { LotPackageGroup } = db;

  const group = await LotPackageGroup.findOne({
    where: {
      lot_package_group_id: id,
      [Op.or]: [
        { company_id: companyId, company_id: { [Op.ne]: null } },
        { builder_id: builderId, builder_id: { [Op.ne]: null } },
      ],
    },
  });

  if (!group) {
    const error = new Error("Lot package group not found");
    error.status = 404;
    throw error;
  }

  if (group_name && group_name.toLowerCase() !== group.group_name.toLowerCase()) {
    const dupCheck = await LotPackageGroup.findOne({
      where: {
        [Op.and]: [
          db.sequelize.where(
            db.sequelize.fn("LOWER", db.sequelize.col("group_name")),
            group_name.toLowerCase(),
          ),
          {
            [Op.or]: [
              { company_id: companyId, company_id: { [Op.ne]: null } },
              { builder_id: builderId, builder_id: { [Op.ne]: null } },
            ],
          },
          { lot_package_group_id: { [Op.ne]: id } },
        ],
      },
    });

    if (dupCheck) {
      const error = new Error("Group name already exists in your organization.");
      error.status = 400;
      throw error;
    }
  }

  await group.update({
    group_name: group_name || group.group_name,
    updated_by: userId,
  });

  return group.get({ plain: true });
};

/**
 * Deletes a lot package group.
 */
export const deleteLotPackageGroupService = async (id, user) => {
  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  if (!builderId && !companyId) {
    const error = new Error("Unauthorized");
    error.status = 401;
    throw error;
  }

  const { LotPackageGroup } = db;

  const group = await LotPackageGroup.findOne({
    where: {
      lot_package_group_id: id,
      [Op.or]: [
        { company_id: companyId, company_id: { [Op.ne]: null } },
        { builder_id: builderId, builder_id: { [Op.ne]: null } },
      ],
    },
  });

  if (!group) {
    const error = new Error("Lot package group not found");
    error.status = 404;
    throw error;
  }

  await group.destroy();
};

export default {
  getAllLotPackageGroupsService,
  createLotPackageGroupService,
  getLotPackageGroupByIdService,
  updateLotPackageGroupService,
  deleteLotPackageGroupService,
};
