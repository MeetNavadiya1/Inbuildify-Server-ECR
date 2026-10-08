import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

const { InclusionPackage } = db;

/**
 * Creates a new inclusion package.
 */
export const createInclusionPackageService = async ({ companyId, builderId, userId, name }) => {
  if (!name) {
    throw { status: 400, message: "Inclusion package name is required." };
  }

  const trimmedName = name.trim();

  // Duplicate check
  const duplicate = await InclusionPackage.findOne({
    where: {
      [Op.and]: [
        db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("name")), trimmedName.toLowerCase()),
        {
          [Op.or]: [
            { company_id: companyId || null },
            { builder_id: builderId || null },
          ],
        },
      ],
    },
  });

  if (duplicate) {
    throw { status: 409, message: "Inclusion package name already exists in your organization." };
  }

  const result = await InclusionPackage.create({
    company_id: companyId,
    builder_id: builderId,
    name: trimmedName,
    created_by: userId,
    updated_by: userId,
  });

  return result;
};

/**
 * Retrieves all inclusion packages for an organization.
 */
export const getAllInclusionPackagesService = async (queryParams, userContext) => {
  const { builderId, companyId } = userContext;
  const { name } = queryParams;

  const where = {
    [Op.or]: [
      { builder_id: builderId || null },
      { company_id: companyId || null },
    ].filter(cond => Object.values(cond)[0] !== null),
  };

  if (name) {
    where.name = { [Op.iLike]: `%${name.trim()}%` };
  }

  const result = await InclusionPackage.findAll({
    where,
    order: [["created_at", "DESC"]],
  });

  return result;
};

/**
 * Retrieves a single inclusion package by ID and organization context.
 */
export const getInclusionPackageByIdService = async (id, userContext) => {
  const { builderId, companyId } = userContext;

  const result = await InclusionPackage.findOne({
    where: {
      inclusion_package_id: id,
      [Op.or]: [
        { builder_id: builderId || null },
        { company_id: companyId || null },
      ],
    },
  });

  if (!result) {
    throw { status: 404, message: "Inclusion package not found or access denied." };
  }

  return result;
};

/**
 * Updates an inclusion package with duplicate validation and locking.
 */
export const updateInclusionPackageService = async (id, name, userContext, userId) => {
  if (!name) {
    throw { status: 400, message: "Name is required to update." };
  }

  const { builderId, companyId } = userContext;
  const trimmedName = name.trim();

  return await db.sequelize.transaction(async (transaction) => {
    // Check existence and lock
    const existing = await InclusionPackage.findOne({
      where: {
        inclusion_package_id: id,
        [Op.or]: [
          { builder_id: builderId || null },
          { company_id: companyId || null },
        ],
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!existing) {
      throw { status: 404, message: "Inclusion package not found or access denied." };
    }

    // Duplicate check excluding self
    const duplicate = await InclusionPackage.findOne({
      where: {
        inclusion_package_id: { [Op.ne]: id },
        [Op.and]: [
          db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("name")), trimmedName.toLowerCase()),
          {
            [Op.or]: [
              { company_id: companyId || null },
              { builder_id: builderId || null },
            ],
          },
        ],
      },
      transaction,
    });

    if (duplicate) {
      throw { status: 409, message: "Inclusion package name already exists in your organization." };
    }

    existing.name = trimmedName;
    existing.updated_by = userId;
    await existing.save({ transaction });

    return existing;
  });
};

/**
 * Deletes an inclusion package by ID and organization context.
 */
export const deleteInclusionPackageService = async (id, userContext) => {
  const { builderId, companyId } = userContext;

  const deletedCount = await InclusionPackage.destroy({
    where: {
      inclusion_package_id: id,
      [Op.or]: [
        { builder_id: builderId || null },
        { company_id: companyId || null },
      ],
    },
  });

  if (deletedCount === 0) {
    throw { status: 404, message: "Inclusion package not found or access denied." };
  }

  return true;
};

export default {
  createInclusionPackageService,
  getAllInclusionPackagesService,
  getInclusionPackageByIdService,
  updateInclusionPackageService,
  deleteInclusionPackageService,
};
