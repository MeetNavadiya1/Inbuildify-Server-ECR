import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * GET ALL PACKAGE GROUPS SERVICE
 */
export async function getAllPackageGroupsService({ builder_id, company_id, page = 1, limit = 25 }) {
  const { Op } = db.Sequelize;
  const pageValue = parseInt(page, 10);
  const limitValue = parseInt(limit, 10);
  const offset = (pageValue - 1) * limitValue;

  const { count, rows } = await db.PackageGroup.findAndCountAll({
    where: {
      [Op.or]: [
        { company_id: company_id || null },
        { builder_id: builder_id || null },
      ],
    },
    order: [["created_at", "DESC"]],
    limit: limitValue,
    offset,
  });

  return {
    packageGroups: rows,
    total: count,
    page: pageValue,
    totalPages: Math.ceil(count / limitValue),
    limit: limitValue,
  };
}

/**
 * CREATE PACKAGE GROUP SERVICE
 */
export async function createPackageGroupService({ builder_id, company_id, name, no_of_packages }) {
  const { Op } = db.Sequelize;

  const duplicateCheck = await db.PackageGroup.findOne({
    where: {
      [Op.and]: [
        db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("name")), name.trim().toLowerCase()),
        {
          [Op.or]: [
            { company_id: company_id || null },
            { builder_id: builder_id || null },
          ],
        },
        { is_sample_data: false },
      ],
    },
  });

  if (duplicateCheck) {
    const error = new Error("Package group with this name already exists.");
    error.status = 409;
    throw error;
  }

  const result = await db.PackageGroup.create({
    company_id,
    builder_id,
    name: name.trim(),
    no_of_packages: Number(no_of_packages) || 0,
  });

  return result.get({ plain: true });
}

/**
 * DELETE PACKAGE GROUP SERVICE
 */
export async function deletePackageGroupService({ package_group_id, builder_id, company_id }) {
  const { Op } = db.Sequelize;

  const group = await db.PackageGroup.findOne({
    where: {
      package_group_id,
      [Op.or]: [
        { company_id: company_id || null },
        { builder_id: builder_id || null },
      ],
    },
  });

  if (!group) {
    const error = new Error("Package group not found or access denied.");
    error.status = 404;
    throw error;
  }

  await group.destroy();
}

/**
 * UPDATE PACKAGE GROUP SERVICE
 */
export async function updatePackageGroupService({ package_group_id, builder_id, company_id, payload }) {
  const { Op } = db.Sequelize;
  const { name, no_of_packages } = payload;

  return await db.sequelize.transaction(async (t) => {
    const group = await db.PackageGroup.findOne({
      where: {
        package_group_id,
        [Op.or]: [
          { company_id: company_id || null },
          { builder_id: builder_id || null },
        ],
      },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!group) {
      const error = new Error("Package group not found or access denied.");
      error.status = 404;
      throw error;
    }

    if (name && name.trim().toLowerCase() !== group.name.toLowerCase()) {
      const duplicateCheck = await db.PackageGroup.findOne({
        where: {
          [Op.and]: [
            db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("name")), name.trim().toLowerCase()),
            {
              [Op.or]: [
                { company_id: company_id || null },
                { builder_id: builder_id || null },
              ],
            },
            { package_group_id: { [Op.ne]: package_group_id } },
            { is_sample_data: false },
          ],
        },
        transaction: t,
      });

      if (duplicateCheck) {
        const error = new Error("Package group name already exists.");
        error.status = 400;
        throw error;
      }
    }

    await group.update(
      {
        name: name !== undefined ? name.trim() : group.name,
        no_of_packages: no_of_packages !== undefined ? no_of_packages : group.no_of_packages,
      },
      { transaction: t },
    );

    return group.get({ plain: true });
  });
}
