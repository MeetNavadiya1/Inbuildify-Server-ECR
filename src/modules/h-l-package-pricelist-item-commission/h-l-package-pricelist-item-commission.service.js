import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Retrieves all package commission mappings for an organization.
 */
export const getAllPackageCommissionMapsService = async (userContext) => {
  const { HLPackageCommissionMap, JobCommission, HouseLandPackage, Sequelize } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const results = await HLPackageCommissionMap.findAll({
    include: [
      {
        model: JobCommission,
        as: "jobCommission",
        attributes: ["name"],
        required: true,
      },
      {
        model: HouseLandPackage,
        as: "houseLandPackage",
        attributes: ["title"],
        required: true,
        where: {
          [Op.or]: [
            { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
            { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
          ],
        },
      },
    ],
    order: [["created_at", "DESC"]],
  });

  const totalCommissionSum = results.reduce(
    (sum, row) => sum + parseFloat(row.total_commission || 0),
    0,
  );

  const formattedMappings = results.map((row) => {
    const json = row.toJSON();
    return {
      id: json.id,
      houseLandPackageId: json.house_land_package_id,
      jobCommissionId: json.job_commission_id,
      commissionName: json.jobCommission?.name || null,
      packageTitle: json.houseLandPackage?.title || null,
      totalCommission: parseFloat(json.total_commission),
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  });

  return {
    mappings: formattedMappings,
    commissionTotal: totalCommissionSum,
  };
};

/**
 * Retrieves all price list item mappings for an organization.
 */
export const getAllPriceListItemMapsService = async (userContext) => {
  const {
    HLPackagePricelistItemMap,
    PriceListItem,
    HouseLandPackage,
    HLPackageCommissionMap,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const orgScope = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  // 1. Fetch Price List Item Mappings
  const results = await HLPackagePricelistItemMap.findAll({
    include: [
      {
        model: PriceListItem,
        as: "priceListItem",
        attributes: ["item_description", "cost"],
        where: { status: "active" },
        required: true,
      },
      {
        model: HouseLandPackage,
        as: "houseLandPackage",
        attributes: ["title"],
        where: orgScope,
        required: true,
      },
    ],
    order: [["created_at", "DESC"]],
  });

  const housePriceSum = results.reduce(
    (sum, row) => sum + parseFloat(row.total_price || 0),
    0,
  );

  // 2. Fetch Organization Commission Total
  const commissionTotalResult = await HLPackageCommissionMap.sum("total_commission", {
    include: [
      {
        model: HouseLandPackage,
        as: "houseLandPackage",
        where: orgScope,
        required: true,
        attributes: [], // We don't need any attributes from HouseLandPackage
      },
    ],
  });

  const organizationCommissionTotal = parseFloat(commissionTotalResult || 0);

  const formattedMappings = results.map((row) => {
    const json = row.toJSON();
    return {
      id: json.id,
      houseLandPackageId: json.house_land_package_id,
      priceListItemId: json.price_list_item_id,
      priceListItemDescription: json.priceListItem?.item_description || null,
      packageTitle: json.houseLandPackage?.title || null,
      quantity: parseFloat(json.quantity),
      totalPrice: parseFloat(json.total_price),
      cost: parseFloat(json.priceListItem?.cost || 0),
      note: json.note,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  });

  return {
    mappings: formattedMappings,
    houseTotal: housePriceSum + organizationCommissionTotal,
    commissionTotal: organizationCommissionTotal,
  };
};

/**
 * Creates a mapping between a house land package and a price list item.
 */
export const createPriceListItemMapService = async ({
  houseLandPackageId,
  priceListItemId,
  quantity,
  note,
  userContext,
}) => {
  const {
    HLPackagePricelistItemMap,
    HLPackageCommissionMap,
    PriceListItem,
    HouseLandPackage,
    sequelize,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const orgScope = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  // 1. Basic Validations
  const pkg = await HouseLandPackage.findOne({
    where: { house_land_package_id: houseLandPackageId, ...orgScope },
  });
  if (!pkg) {
    throw { status: 404, message: "House land package not found" };
  }

  const item = await PriceListItem.findOne({
    where: { price_list_item_id: priceListItemId, status: "active", ...orgScope },
  });
  if (!item) {
    throw { status: 404, message: "Price list item not found or does not belong to your organization" };
  }

  if (item.cost_type === "Included" && quantity !== undefined && quantity !== null) {
    throw { status: 400, message: "Quantity cannot be specified for items with cost type 'Included'" };
  }

  // 2. Duplicate Check
  const exists = await HLPackagePricelistItemMap.findOne({
    where: { house_land_package_id: houseLandPackageId, price_list_item_id: priceListItemId },
  });
  if (exists) {
    throw { status: 400, message: "This price list item is already mapped to this house land package" };
  }

  const quantityToUse = parseFloat(quantity) || 1;
  const price = parseFloat(item.cost) || 0;
  const totalPrice = price * quantityToUse;

  const transaction = await sequelize.transaction();
  try {
    // 3. Create Mapping
    const mapping = await HLPackagePricelistItemMap.create(
      {
        house_land_package_id: houseLandPackageId,
        price_list_item_id: priceListItemId,
        quantity: quantityToUse,
        total_price: totalPrice,
        note: note || null,
      },
      { transaction },
    );

    // 4. Fetch Enriched Mapping for Response
    const enriched = await HLPackagePricelistItemMap.findOne({
      where: { id: mapping.id },
      include: [
        { model: PriceListItem, as: "priceListItem", attributes: ["item_description", "cost"] },
        { model: HouseLandPackage, as: "houseLandPackage", attributes: ["title"] },
      ],
      transaction,
    });

    // 5. Calculate New Totals
    const housePriceSum = await HLPackagePricelistItemMap.sum("total_price", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });
    const commissionSum = await HLPackageCommissionMap.sum("total_commission", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });

    const currentPriceTotal = parseFloat(housePriceSum || 0);
    const currentCommissionTotal = parseFloat(commissionSum || 0);

    await transaction.commit();

    // 6. Format Response
    const json = enriched.toJSON();
    return {
      mapping: {
        id: json.id,
        houseLandPackageId: json.house_land_package_id,
        priceListItemId: json.price_list_item_id,
        priceListItemDescription: json.priceListItem?.item_description || null,
        packageTitle: json.houseLandPackage?.title || null,
        quantity: parseFloat(json.quantity),
        totalPrice: parseFloat(json.total_price),
        cost: parseFloat(json.priceListItem?.cost || 0),
        note: json.note,
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      },
      houseTotal: currentPriceTotal + currentCommissionTotal,
      commissionTotal: currentCommissionTotal,
    };

  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Retrieves commission mappings and totals for a specific house land package.
 */
export const getPackageCommissionMapsService = async ({
  houseLandPackageId,
  userContext,
}) => {
  const {
    HLPackageCommissionMap,
    HLPackagePricelistItemMap,
    JobCommission,
    HouseLandPackage,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const orgScope = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  // 1. Validate Package and Scope
  const pkg = await HouseLandPackage.findOne({
    where: { house_land_package_id: houseLandPackageId, ...orgScope },
  });
  if (!pkg) {
    return null;
  }

  // 2. Calculate Totals
  const housePriceSumResult = await HLPackagePricelistItemMap.sum("total_price", {
    where: { house_land_package_id: houseLandPackageId },
  });
  const housePriceTotal = parseFloat(housePriceSumResult || 0);

  const commissionTotalSumResult = await HLPackageCommissionMap.sum("total_commission", {
    where: { house_land_package_id: houseLandPackageId },
  });
  const commissionTotal = parseFloat(commissionTotalSumResult || 0);

  // 3. Fetch Mappings with Relational Data
  const mappingsResult = await HLPackageCommissionMap.findAll({
    where: { house_land_package_id: houseLandPackageId },
    include: [
      {
        model: JobCommission,
        as: "jobCommission",
        attributes: ["name", "commission_type"],
      },
      {
        model: HouseLandPackage,
        as: "houseLandPackage",
        attributes: ["title"],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  const formattedMappings = mappingsResult.map((row) => {
    const json = row.toJSON();
    return {
      id: json.id,
      houseLandPackageId: json.house_land_package_id,
      jobCommissionId: json.job_commission_id,
      commissionName: json.jobCommission?.name || null,
      packageTitle: json.houseLandPackage?.title || null,
      totalCommission: parseFloat(json.total_commission),
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  });

  return {
    mappings: formattedMappings,
    houseTotal: housePriceTotal + commissionTotal,
    commissionTotal,
  };
};

/**
 * Retrieves price list item mappings and totals for a specific house land package.
 */
export const getPriceListItemMapsService = async ({
  houseLandPackageId,
  userContext,
}) => {
  const {
    HLPackagePricelistItemMap,
    HLPackageCommissionMap,
    PriceListItem,
    HouseLandPackage,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const orgScope = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  // 1. Validate Package and Scope
  const pkg = await HouseLandPackage.findOne({
    where: { house_land_package_id: houseLandPackageId, ...orgScope },
  });
  if (!pkg) {
    return null;
  }

  // 2. Fetch Mappings with Relational Data
  const mappingsResult = await HLPackagePricelistItemMap.findAll({
    where: { house_land_package_id: houseLandPackageId },
    include: [
      {
        model: PriceListItem,
        as: "priceListItem",
        attributes: ["item_description", "cost"],
        where: { status: "active" },
        required: true,
      },
      {
        model: HouseLandPackage,
        as: "houseLandPackage",
        attributes: ["title"],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  // 3. Calculate Totals
  const housePriceTotal = mappingsResult.reduce(
    (sum, row) => sum + parseFloat(row.total_price || 0),
    0,
  );

  const commissionTotalSumResult = await HLPackageCommissionMap.sum("total_commission", {
    where: { house_land_package_id: houseLandPackageId },
  });
  const commissionTotal = parseFloat(commissionTotalSumResult || 0);

  const formattedMappings = mappingsResult.map((row) => {
    const json = row.toJSON();
    return {
      id: json.id,
      houseLandPackageId: json.house_land_package_id,
      priceListItemId: json.price_list_item_id,
      priceListItemDescription: json.priceListItem?.item_description || null,
      packageTitle: json.houseLandPackage?.title || null,
      quantity: parseFloat(json.quantity),
      totalPrice: parseFloat(json.total_price),
      cost: parseFloat(json.priceListItem?.cost || 0),
      note: json.note,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  });

  return {
    mappings: formattedMappings,
    houseTotal: housePriceTotal + commissionTotal,
    commissionTotal,
  };
};

/**
 * Updates an existing price list item mapping.
 */
export const updatePriceListItemMapService = async ({
  id,
  quantity,
  note,
  userContext,
}) => {
  const {
    HLPackagePricelistItemMap,
    HLPackageCommissionMap,
    PriceListItem,
    HouseLandPackage,
    sequelize,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const orgScope = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  const transaction = await sequelize.transaction();

  try {
    // 1. Fetch existing mapping with organizational scope validation
    const mapping = await HLPackagePricelistItemMap.findOne({
      where: { id },
      include: [
        {
          model: PriceListItem,
          as: "priceListItem",
          attributes: ["cost", "cost_type", "status"],
          where: { status: "active", ...orgScope },
          required: true,
        },
        {
          model: HouseLandPackage,
          as: "houseLandPackage",
          attributes: ["house_land_package_id"],
          where: orgScope,
          required: true,
        },
      ],
      transaction,
    });

    if (!mapping) {
      throw {
        status: 404,
        message: "Price list item mapping not found or price list item does not belong to your organization",
      };
    }

    // 2. Business Validations
    if (mapping.priceListItem.cost_type === "Included" && quantity !== undefined && quantity !== null) {
      throw {
        status: 400,
        message: "Quantity cannot be updated for items with cost type 'Included'",
      };
    }

    const quantityToUse = quantity !== undefined && quantity !== null ? parseFloat(quantity) : parseFloat(mapping.quantity);
    const price = parseFloat(mapping.priceListItem.cost) || 0;
    const totalPrice = price * quantityToUse;

    // 3. Update Mapping
    const updateData = {
      quantity: quantityToUse,
      total_price: totalPrice,
    };
    if (note !== undefined) {
      updateData.note = note;
    }

    await mapping.update(updateData, { transaction });

    // 4. Fetch Enriched Mapping for Response
    const enriched = await HLPackagePricelistItemMap.findOne({
      where: { id },
      include: [
        { model: PriceListItem, as: "priceListItem", attributes: ["item_description", "cost"] },
        { model: HouseLandPackage, as: "houseLandPackage", attributes: ["title"] },
      ],
      transaction,
    });

    // 5. Calculate New Totals
    const houseLandPackageId = mapping.house_land_package_id;
    const housePriceSum = await HLPackagePricelistItemMap.sum("total_price", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });
    const commissionSum = await HLPackageCommissionMap.sum("total_commission", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });

    const currentPriceTotal = parseFloat(housePriceSum || 0);
    const currentCommissionTotal = parseFloat(commissionSum || 0);

    await transaction.commit();

    // 6. Format Response to match exact API requirements
    const json = enriched.toJSON();
    return {
      mapping: {
        id: json.id,
        houseLandPackageId: json.house_land_package_id,
        priceListItemId: json.price_list_item_id,
        priceListItemDescription: json.priceListItem?.item_description || null,
        packageTitle: json.houseLandPackage?.title || null,
        quantity: parseFloat(json.quantity),
        totalPrice: parseFloat(json.total_price),
        cost: parseFloat(json.priceListItem?.cost || 0),
        note: json.note,
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      },
      houseTotal: currentPriceTotal + currentCommissionTotal,
      commissionTotal: currentCommissionTotal,
    };

  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Deletes an existing price list item mapping.
 */
export const deletePriceListItemMapService = async ({ id, userContext }) => {
  const {
    HLPackagePricelistItemMap,
    HLPackageCommissionMap,
    HouseLandPackage,
    sequelize,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const orgScope = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  const transaction = await sequelize.transaction();

  try {
    // 1. Fetch mapping with organizational scope validation
    const mapping = await HLPackagePricelistItemMap.findOne({
      where: { id },
      include: [
        {
          model: HouseLandPackage,
          as: "houseLandPackage",
          attributes: ["house_land_package_id"],
          where: orgScope,
          required: true,
        },
      ],
      transaction,
    });

    if (!mapping) {
      throw {
        status: 404,
        message: "Price list item mapping not found",
      };
    }

    const houseLandPackageId = mapping.house_land_package_id;

    // 2. Delete Mapping
    await mapping.destroy({ transaction });

    // 3. Calculate New Totals
    const housePriceSumResult = await HLPackagePricelistItemMap.sum("total_price", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });
    const housePriceTotal = parseFloat(housePriceSumResult || 0);

    const commissionTotalSumResult = await HLPackageCommissionMap.sum("total_commission", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });
    const commissionTotal = parseFloat(commissionTotalSumResult || 0);

    await transaction.commit();

    return {
      houseTotal: housePriceTotal + commissionTotal,
      commissionTotal,
    };
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Creates mapping between house land package and job commissions.
 */
export const createPackageCommissionMapService = async ({
  houseLandPackageId,
  jobCommissionId,
  userContext,
}) => {
  const {
    HLPackageCommissionMap,
    HLPackagePricelistItemMap,
    JobCommission,
    JobCommissionSubStage,
    HouseLandPackage,
    sequelize,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const orgScope = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  const transaction = await sequelize.transaction();

  try {
    // 1. Validate Package and Org Scope
    const pkg = await HouseLandPackage.findOne({
      where: { house_land_package_id: houseLandPackageId, ...orgScope },
      transaction,
    });
    if (!pkg) {
      throw { status: 404, message: "House land package not found" };
    }

    const jobCommissionIds = Array.isArray(jobCommissionId) ? jobCommissionId : [jobCommissionId];
    const createdIds = [];

    for (const commissionId of jobCommissionIds) {
      // 2. Validate Commission belonging to organization
      const commission = await JobCommission.findOne({
        where: { job_commission_id: commissionId, ...orgScope },
        transaction,
      });
      if (!commission) {
        throw {
          status: 404,
          message: `Job commission ${commissionId} not found or does not belong to your organization`,
        };
      }

      // 3. Duplicate check
      const exists = await HLPackageCommissionMap.findOne({
        where: { house_land_package_id: houseLandPackageId, job_commission_id: commissionId },
        transaction,
      });
      if (exists) {
        throw {
          status: 400,
          message: `Commission ${commissionId} is already mapped to this house land package`,
        };
      }

      // 4. Calculate Total from Sub-Stages
      const total = await JobCommissionSubStage.sum("commission_value", {
        where: { job_commission_id: commissionId },
        transaction,
      });

      // 5. Create Mapping
      const mapping = await HLPackageCommissionMap.create(
        {
          house_land_package_id: houseLandPackageId,
          job_commission_id: commissionId,
          total_commission: parseFloat(total || 0),
        },
        { transaction },
      );
      createdIds.push(mapping.id);
    }

    // 6. Fetch First Created Detailed Mapping for legacy-compatible response
    const firstMappingResult = await HLPackageCommissionMap.findOne({
      where: { id: createdIds[0] },
      include: [
        { model: JobCommission, as: "jobCommission", attributes: ["name"] },
        { model: HouseLandPackage, as: "houseLandPackage", attributes: ["title"] },
      ],
      transaction,
    });

    // 7. Calculate New Totals
    const housePriceSumResult = await HLPackagePricelistItemMap.sum("total_price", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });
    const commissionTotalSumResult = await HLPackageCommissionMap.sum("total_commission", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });

    const housePriceTotal = parseFloat(housePriceSumResult || 0);
    const commissionTotal = parseFloat(commissionTotalSumResult || 0);

    await transaction.commit();

    const json = firstMappingResult.toJSON();
    return {
      mapping: {
        id: json.id,
        houseLandPackageId: json.house_land_package_id,
        jobCommissionId: json.job_commission_id,
        commissionName: json.jobCommission?.name || null,
        packageTitle: json.houseLandPackage?.title || null,
        totalCommission: parseFloat(json.total_commission),
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      },
      houseTotal: housePriceTotal + commissionTotal,
      commissionTotal: commissionTotal,
    };
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Updates an existing package commission mapping.
 */
export const updatePackageCommissionMapService = async ({
  id,
  jobCommissionId,
  userContext,
}) => {
  const {
    HLPackageCommissionMap,
    HLPackagePricelistItemMap,
    JobCommission,
    JobCommissionSubStage,
    HouseLandPackage,
    sequelize,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const orgScope = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  const transaction = await sequelize.transaction();

  try {
    // 1. Fetch and Validate existing mapping
    const mapping = await HLPackageCommissionMap.findOne({
      where: { id },
      include: [
        {
          model: HouseLandPackage,
          as: "houseLandPackage",
          where: orgScope,
          required: true,
        },
      ],
      transaction,
    });
    if (!mapping) {
      throw { status: 404, message: "Package commission mapping not found" };
    }

    const houseLandPackageId = mapping.house_land_package_id;
    const commissionIdToUse = jobCommissionId || mapping.job_commission_id;

    // 2. Validate new job commission belonging to organization if provided
    if (jobCommissionId) {
      const commission = await JobCommission.findOne({
        where: { job_commission_id: jobCommissionId, ...orgScope },
        transaction,
      });
      if (!commission) {
        throw {
          status: 404,
          message: "Job commission not found or does not belong to your organization",
        };
      }
    }

    // 3. Recalculate total from sub-stages
    const total = await JobCommissionSubStage.sum("commission_value", {
      where: { job_commission_id: commissionIdToUse },
      transaction,
    });

    // 4. Update the mapping
    await mapping.update(
      {
        job_commission_id: commissionIdToUse,
        total_commission: parseFloat(total || 0),
      },
      { transaction },
    );

    // 5. Fetch enriched details
    const enriched = await HLPackageCommissionMap.findOne({
      where: { id },
      include: [
        { model: JobCommission, as: "jobCommission", attributes: ["name"] },
        { model: HouseLandPackage, as: "houseLandPackage", attributes: ["title"] },
      ],
      transaction,
    });

    // 6. Calculate new totals
    const housePriceSumResult = await HLPackagePricelistItemMap.sum("total_price", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });
    const commissionTotalSumResult = await HLPackageCommissionMap.sum("total_commission", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });

    const housePriceTotal = parseFloat(housePriceSumResult || 0);
    const commissionTotal = parseFloat(commissionTotalSumResult || 0);

    await transaction.commit();

    const json = enriched.toJSON();
    return {
      mapping: {
        id: json.id,
        houseLandPackageId: json.house_land_package_id,
        jobCommissionId: json.job_commission_id,
        commissionName: json.jobCommission?.name || null,
        packageTitle: json.houseLandPackage?.title || null,
        totalCommission: parseFloat(json.total_commission),
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      },
      houseTotal: housePriceTotal + commissionTotal,
      commissionTotal: commissionTotal,
    };
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Deletes an existing package commission mapping.
 */
export const deletePackageCommissionMapService = async ({ id, userContext }) => {
  const {
    HLPackageCommissionMap,
    HLPackagePricelistItemMap,
    HouseLandPackage,
    sequelize,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const orgScope = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  const transaction = await sequelize.transaction();

  try {
    // 1. Fetch and validate existing mapping
    const mapping = await HLPackageCommissionMap.findOne({
      where: { id },
      include: [
        {
          model: HouseLandPackage,
          as: "houseLandPackage",
          where: orgScope,
          required: true,
        },
      ],
      transaction,
    });
    if (!mapping) {
      throw { status: 404, message: "Package commission mapping not found" };
    }

    const houseLandPackageId = mapping.house_land_package_id;

    // 2. Delete mapping
    await mapping.destroy({ transaction });

    // 3. Recalculate totals
    const housePriceSumResult = await HLPackagePricelistItemMap.sum("total_price", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });
    const commissionTotalSumResult = await HLPackageCommissionMap.sum("total_commission", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });

    const housePriceTotal = parseFloat(housePriceSumResult || 0);
    const commissionTotal = parseFloat(commissionTotalSumResult || 0);

    await transaction.commit();

    return {
      houseTotal: housePriceTotal + commissionTotal,
      commissionTotal: commissionTotal,
    };
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
};


export default {
  getAllPackageCommissionMapsService,
  getAllPriceListItemMapsService,
  createPriceListItemMapService,
  updatePriceListItemMapService,
  deletePriceListItemMapService,
  createPackageCommissionMapService,
  updatePackageCommissionMapService,
  deletePackageCommissionMapService,
  getPackageCommissionMapsService,
  getPriceListItemMapsService,
};

