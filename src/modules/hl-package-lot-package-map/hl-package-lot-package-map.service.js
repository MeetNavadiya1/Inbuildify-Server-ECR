import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

const { HLPackageLotPackageMap, HouseLandPackage, LotPackage, Lot } = db;

export async function createHlPackageLotPackageMapService(data, companyId, builderId) {
  const { house_land_package_id: houseLandPackageId, lot_package_id: lotPackageId } = data;

  const authConditions = [];
  if (companyId) authConditions.push({ company_id: companyId });
  if (builderId) authConditions.push({ builder_id: builderId });

  return await db.sequelize.transaction(async (transaction) => {
    // Check House Land Package
    const hlpCheck = await HouseLandPackage.findOne({
      where: {
        house_land_package_id: houseLandPackageId,
        [Op.or]: authConditions,
      },
      transaction,
    });

    if (!hlpCheck) {
      const error = new Error("House land package not found or unauthorized access.");
      error.statusCode = 404;
      throw error;
    }

    // Check Lot Package
    const lpCheck = await LotPackage.findOne({
      where: { lot_package_id: lotPackageId },
      include: [
        {
          model: Lot,
          as: "lot",
          required: true,
          attributes: ["lot_id", "company_id", "builder_id"],
          where: {
            [Op.or]: authConditions,
          },
        },
      ],
      transaction,
    });

    if (!lpCheck) {
      const error = new Error("Lot package not found or unauthorized access.");
      error.statusCode = 404;
      throw error;
    }

    // Check existing mapping
    const mapCheck = await HLPackageLotPackageMap.findOne({
      where: {
        house_land_package_id: houseLandPackageId,
        lot_package_id: lotPackageId,
      },
      transaction,
    });

    if (mapCheck) {
      const error = new Error("This mapping already exists.");
      error.statusCode = 400;
      throw error;
    }

    const newMap = await HLPackageLotPackageMap.create(
      {
        house_land_package_id: houseLandPackageId,
        lot_package_id: lotPackageId,
      },
      { transaction }
    );

    return newMap;
  });
}

export async function getLotPackagesByHlPackageIdService(houseLandPackageId, companyId, builderId) {
  const authConditions = [];
  if (companyId) authConditions.push({ company_id: companyId });
  if (builderId) authConditions.push({ builder_id: builderId });

  const hlpCheck = await HouseLandPackage.findOne({
    where: {
      house_land_package_id: houseLandPackageId,
      [Op.or]: authConditions,
    },
  });

  if (!hlpCheck) {
    const error = new Error("House land package not found or unauthorized access.");
    error.statusCode = 404;
    throw error;
  }

  const mappings = await HLPackageLotPackageMap.findAll({
    where: { house_land_package_id: houseLandPackageId },
    include: [
      {
        model: LotPackage,
        as: "lotPackage",
        required: true,
        include: [
          {
            model: Lot,
            as: "lot",
            required: true,
            attributes: ["lot_number"],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return mappings.map((m) => {
    const plain = m.get({ plain: true });
    return {
      mapId: plain.id,
      ...plain.lotPackage,
      lotNumber: plain.lotPackage?.lot?.lot_number,
    };
  });
}

export async function deleteHlPackageLotPackageMapService(id, companyId, builderId) {
  const authConditions = [];
  if (companyId) authConditions.push({ company_id: companyId });
  if (builderId) authConditions.push({ builder_id: builderId });

  return await db.sequelize.transaction(async (transaction) => {
    const mapping = await HLPackageLotPackageMap.findOne({
      where: { id },
      include: [
        {
          model: HouseLandPackage,
          as: "houseLandPackage",
          required: true,
          attributes: ["house_land_package_id", "company_id", "builder_id"],
          where: {
            [Op.or]: authConditions,
          },
        },
      ],
      transaction,
    });

    if (!mapping) {
      return { success: false, message: "Mapping not found or unauthorized access." };
    }

    await mapping.destroy({ transaction });
    return { success: true };
  });
}

export async function getAllHlPackageLotPackageMapsService(companyId, builderId, page = 1, limit = 25) {
  const authConditions = [];
  if (companyId) authConditions.push({ company_id: companyId });
  if (builderId) authConditions.push({ builder_id: builderId });

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const { count, rows } = await HLPackageLotPackageMap.findAndCountAll({
    include: [
      {
        model: HouseLandPackage,
        as: "houseLandPackage",
        required: true,
        attributes: ["title"],
        where: {
          [Op.or]: authConditions,
        },
      },
      {
        model: LotPackage,
        as: "lotPackage",
        required: true,
        attributes: ["package_name"],
        include: [
          {
            model: Lot,
            as: "lot",
            required: true,
            attributes: ["lot_number"],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: limitNum,
    offset,
  });

  const totalPages = Math.ceil(count / limitNum);

  const mappedRows = rows.map((row) => {
    const plain = row.get({ plain: true });
    return {
      ...plain,
      hlpTitle: plain.houseLandPackage?.title,
      packageName: plain.lotPackage?.package_name,
      lotNumber: plain.lotPackage?.lot?.lot_number,
    };
  });

  return {
    mappings: mappedRows,
    pagination: {
      totalRecords: count,
      currentPage: pageNum,
      totalPages,
      limit: limitNum,
    },
  };
}
