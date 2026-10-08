import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

/**
 * Creates a new lot package with extensive validation and scoping.
 */
export const createLotPackageService = async (data, user) => {
  const {
    lot_id,
    package_name,
    dwelling_type_id,
    range_id,
    lot_package_group_id,
    disclaimer,
    floor_plan_id,
    facade_id,
  } = data;

  const userId = user?.users_id;
  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  if (!userId || (!builderId && !companyId)) {
    const error = new Error("Unauthorized: User must belong to either a builder or company");
    error.status = 401;
    throw error;
  }

  const {
    Lot,
    LotPackage,
    DwellingType,
    Range,
    LotPackageGroup,
    Facade,
    FloorPlan,
    sequelize,
  } = db;

  const transaction = await sequelize.transaction();
  try {
    // 1. Lot Validation
    const lot = await Lot.findOne({
      where: {
        lot_id,
        [Op.or]: [
          { company_id: companyId, company_id: { [Op.ne]: null } },
          { builder_id: builderId, builder_id: { [Op.ne]: null } },
        ],
      },
      transaction,
    });
    if (!lot) {
      throw { status: 404, message: "Lot not found or unauthorized access." };
    }

    // 2. Duplicate Name Check
    const dupCheck = await LotPackage.findOne({
      include: [
        {
          model: Lot,
          as: "lot",
          where: {
            [Op.or]: [
              { company_id: companyId, company_id: { [Op.ne]: null } },
              { builder_id: builderId, builder_id: { [Op.ne]: null } },
            ],
          },
        },
      ],
      where: sequelize.where(
        sequelize.fn("LOWER", sequelize.col("package_name")),
        package_name.toLowerCase(),
      ),
      transaction,
    });
    if (dupCheck) {
      throw { status: 400, message: "Package name already exists in your organization." };
    }

    // 3. Entity Validations
    if (dwelling_type_id) {
      const dt = await DwellingType.findOne({
        where: {
          dwelling_type_id,
          is_active: true,
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });
      if (!dt) throw { status: 400, message: "Invalid or inactive dwelling type." };
    }

    if (range_id) {
      const r = await Range.findOne({
        where: {
          range_id,
          is_active: true,
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });
      if (!r) throw { status: 400, message: "Invalid or inactive range." };
    }

    if (lot_package_group_id) {
      const lpg = await LotPackageGroup.findOne({
        where: {
          lot_package_group_id,
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });
      if (!lpg) throw { status: 400, message: "Invalid lot package group." };
    }

    if (facade_id) {
      const f = await Facade.findOne({
        where: {
          facade_id,
          status: true,
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });
      if (!f) throw { status: 400, message: "Invalid or inactive facade." };
      if (f.dwelling_type_id !== dwelling_type_id) {
        throw { status: 400, message: "Facade does not match the provided dwelling type." };
      }
    }

    if (floor_plan_id) {
      const fp = await FloorPlan.findOne({
        where: {
          floor_plan_id,
          status: true,
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });
      if (!fp) throw { status: 400, message: "Invalid or inactive floor plan." };
      if (fp.dwelling_type_id !== dwelling_type_id) {
        throw { status: 400, message: "Floor plan does not match the provided dwelling type." };
      }
    }

    // 4. Creation
    const lotPackage = await LotPackage.create(
      {
        lot_id,
        package_name,
        dwelling_type_id: dwelling_type_id || null,
        range_id: range_id || null,
        lot_package_group_id: lot_package_group_id || null,
        disclaimer: disclaimer || null,
        floor_plan_id: floor_plan_id || null,
        facade_id: facade_id || null,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();
    return lotPackage.get({ plain: true });
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

/**
 * Retrieves all lot packages with advanced filtering and pagination.
 */
export const getAllLotPackagesService = async (query, user) => {
  const {
    page = 1,
    limit = 25,
    lot_id,
    dwelling_type_id,
    range_id,
    lot_package_group_id,
    search,
  } = query;

  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  if (!builderId && !companyId) {
    const error = new Error("Unauthorized: User must belong to either a builder or company");
    error.status = 401;
    throw error;
  }

  const {
    LotPackage,
    Lot,
    DwellingType,
    Range,
    LotPackageGroup,
    FloorPlan,
    Facade,
  } = db;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const where = {};
  const lotWhere = {
    [Op.or]: [
      { company_id: companyId, company_id: { [Op.ne]: null } },
      { builder_id: builderId, builder_id: { [Op.ne]: null } },
    ],
  };

  if (lot_id) where.lot_id = lot_id;
  if (dwelling_type_id) where.dwelling_type_id = dwelling_type_id;
  if (range_id) where.range_id = range_id;
  if (lot_package_group_id) where.lot_package_group_id = lot_package_group_id;
  if (search) where.package_name = { [Op.iLike]: `%${search}%` };

  const { count, rows } = await LotPackage.findAndCountAll({
    where,
    include: [
      {
        model: Lot,
        as: "lot",
        where: lotWhere,
        attributes: ["lot_number"],
        required: true,
      },
      {
        model: DwellingType,
        as: "dwellingType",
        attributes: ["name"],
      },
      {
        model: Range,
        as: "range",
        attributes: ["name"],
      },
      {
        model: LotPackageGroup,
        as: "lotPackageGroup",
        attributes: ["group_name"],
      },
      {
        model: FloorPlan,
        as: "floorPlan",
        attributes: ["name"],
      },
      {
        model: Facade,
        as: "facade",
        attributes: ["name"],
      },
    ],
    order: [["created_at", "DESC"]],
    limit: parseInt(limit),
    offset,
  });

  const packages = rows.map((item) => {
    const json = item.toJSON();
    return {
      ...json,
      lot_number: json.lot?.lot_number,
      dwelling_type_name: json.dwellingType?.name,
      range_name: json.range?.name,
      lot_package_group_name: json.lotPackageGroup?.group_name,
      floor_plan_name: json.floorPlan?.name,
      facade_name: json.facade?.name,
    };
  });

  return {
    packages,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

/**
 * Retrieves a lot package by ID.
 */
export const getLotPackageByIdService = async (id, user) => {
  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  if (!builderId && !companyId) {
    const error = new Error("Unauthorized");
    error.status = 401;
    throw error;
  }

  const {
    LotPackage,
    Lot,
    DwellingType,
    Range,
    LotPackageGroup,
    FloorPlan,
    Facade,
  } = db;

  const lotPackage = await LotPackage.findOne({
    where: { lot_package_id: id },
    include: [
      {
        model: Lot,
        as: "lot",
        where: {
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        attributes: ["lot_number"],
        required: true,
      },
      {
        model: DwellingType,
        as: "dwellingType",
        attributes: ["name"],
      },
      {
        model: Range,
        as: "range",
        attributes: ["name"],
      },
      {
        model: LotPackageGroup,
        as: "lotPackageGroup",
        attributes: ["group_name"],
      },
      {
        model: FloorPlan,
        as: "floorPlan",
        attributes: ["name"],
      },
      {
        model: Facade,
        as: "facade",
        attributes: ["name"],
      },
    ],
  });

  if (!lotPackage) {
    const error = new Error("Lot package not found");
    error.status = 404;
    throw error;
  }

  const json = lotPackage.toJSON();
  return {
    ...json,
    lot_number: json.lot?.lot_number,
    dwelling_type_name: json.dwellingType?.name,
    range_name: json.range?.name,
    lot_package_group_name: json.lotPackageGroup?.group_name,
    floor_plan_name: json.floorPlan?.name,
    facade_name: json.facade?.name,
  };
};

/**
 * Updates a lot package with validation rules.
 */
export const updateLotPackageService = async (id, data, user) => {
  const userId = user?.users_id;
  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  if (!userId || (!builderId && !companyId)) {
    const error = new Error("Unauthorized");
    error.status = 401;
    throw error;
  }

  const {
    LotPackage,
    Lot,
    DwellingType,
    Range,
    LotPackageGroup,
    Facade,
    FloorPlan,
    sequelize,
  } = db;

  const transaction = await sequelize.transaction();
  try {
    const lotPackage = await LotPackage.findOne({
      where: { lot_package_id: id },
      include: [
        {
          model: Lot,
          as: "lot",
          where: {
            [Op.or]: [
              { company_id: companyId, company_id: { [Op.ne]: null } },
              { builder_id: builderId, builder_id: { [Op.ne]: null } },
            ],
          },
          required: true,
        },
      ],
      transaction,
    });

    if (!lotPackage) {
      throw { status: 404, message: "Lot package not found" };
    }

    if (data.lot_id !== undefined && data.lot_id !== lotPackage.lot_id) {
      throw { status: 400, message: "lot_id cannot be updated" };
    }

    const targetDwellingTypeId = data.dwelling_type_id || lotPackage.dwelling_type_id;

    if (data.package_name && data.package_name.toLowerCase() !== lotPackage.package_name.toLowerCase()) {
      const dupCheck = await LotPackage.findOne({
        include: [{ model: Lot, as: "lot", where: {
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        }}],
        where: [
          sequelize.where(sequelize.fn("LOWER", sequelize.col("package_name")), data.package_name.toLowerCase()),
          { lot_package_id: { [Op.ne]: id } }
        ],
        transaction,
      });
      if (dupCheck) throw { status: 400, message: "Package name already exists in your organization." };
    }

    if (data.dwelling_type_id) {
      const dt = await DwellingType.findOne({
        where: {
          dwelling_type_id: data.dwelling_type_id,
          is_active: true,
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });
      if (!dt) throw { status: 400, message: "Invalid or inactive dwelling type." };
    }

    if (data.range_id) {
      const r = await Range.findOne({
        where: {
          range_id: data.range_id,
          is_active: true,
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });
      if (!r) throw { status: 400, message: "Invalid or inactive range." };
    }

    if (data.lot_package_group_id) {
      const lpg = await LotPackageGroup.findOne({
        where: {
          lot_package_group_id: data.lot_package_group_id,
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });
      if (!lpg) throw { status: 400, message: "Invalid lot package group." };
    }

    const finalFacadeId = data.facade_id !== undefined ? data.facade_id : lotPackage.facade_id;
    if (finalFacadeId) {
      const f = await Facade.findOne({
        where: {
          facade_id: finalFacadeId,
          status: true,
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });
      if (!f) throw { status: 400, message: "Invalid or inactive facade." };
      if (f.dwelling_type_id !== targetDwellingTypeId) {
        throw { status: 400, message: "Facade does not match the dwelling type." };
      }
    }

    const finalFloorPlanId = data.floor_plan_id !== undefined ? data.floor_plan_id : lotPackage.floor_plan_id;
    if (finalFloorPlanId) {
      const fp = await FloorPlan.findOne({
        where: {
          floor_plan_id: finalFloorPlanId,
          status: true,
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });
      if (!fp) throw { status: 400, message: "Invalid or inactive floor plan." };
      if (fp.dwelling_type_id !== targetDwellingTypeId) {
        throw { status: 400, message: "Floor plan does not match the dwelling type." };
      }
    }

    const updateData = { ...data, updated_by: userId };
    await lotPackage.update(updateData, { transaction });

    await transaction.commit();
    return lotPackage.get({ plain: true });
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

/**
 * Deletes a lot package.
 */
export const deleteLotPackageService = async (id, user) => {
  const builderId = user?.builder_id;
  const companyId = user?.company_id;

  if (!builderId && !companyId) {
    const error = new Error("Unauthorized");
    error.status = 401;
    throw error;
  }

  const { LotPackage, Lot } = db;

  const lotPackage = await LotPackage.findOne({
    where: { lot_package_id: id },
    include: [
      {
        model: Lot,
        as: "lot",
        where: {
          [Op.or]: [
            { company_id: companyId, company_id: { [Op.ne]: null } },
            { builder_id: builderId, builder_id: { [Op.ne]: null } },
          ],
        },
        required: true,
      },
    ],
  });

  if (!lotPackage) {
    const error = new Error("Lot package not found");
    error.status = 404;
    throw error;
  }

  await lotPackage.destroy();
};

export default {
  createLotPackageService,
  getAllLotPackagesService,
  getLotPackageByIdService,
  updateLotPackageService,
  deleteLotPackageService,
};
