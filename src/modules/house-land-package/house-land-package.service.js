import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";

/**
 * Creates a new house land package with validations, commissions mapping, and relational enrichment.
 */
export const createHouseLandPackageService = async ({ userId, builderId, companyId, data }) => {
  const {
    HouseLandPackage,
    Lot,
    DwellingType,
    Range,
    LotPackageGroup,
    Facade,
    FloorPlan,
    JobCommission,
    JobCommissionSubStage,
    HLPackageCommissionMap,
    Users,
    Estate,
    EstateStages,
    sequelize,
    Sequelize,
  } = db;
  const { Op } = Sequelize;

  const {
    title,
    lot_id,
    dwelling_type_id,
    package_group_id,
    range_id,
    disclaimer_type,
    floor_plan_id,
    facade_id,
  } = data;

  // 1. Authorization
  if (!userId || (!builderId && !companyId)) {
    throw { status: 401, message: "Unauthorized: User must belong to either a builder or company" };
  }

  if (!title) {
    throw { status: 400, message: "Title is required for creating house land package" };
  }

  // 2. Duplicate Title Check
  const titleCheck = await HouseLandPackage.findOne({
    where: {
      title,
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    },
  });

  if (titleCheck) {
    throw { status: 400, message: "A house land package with this title already exists" };
  }

  // 3. Foreign Key Validations
  if (lot_id && !dwelling_type_id) {
    throw { status: 400, message: "Dwelling type ID is required when a Lot ID is provided" };
  }

  if (lot_id) {
    const lot = await Lot.findOne({
      where: {
        lot_id,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!lot) {
      throw { status: 404, message: "Lot not found or unauthorized access." };
    }
  }

  if (dwelling_type_id) {
    const dt = await DwellingType.findOne({
      where: {
        dwelling_type_id,
        is_active: true,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!dt) {
      throw { status: 400, message: "Invalid or inactive dwelling type." };
    }
  }

  if (range_id) {
    const range = await Range.findOne({
      where: {
        range_id,
        is_active: true,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!range) {
      throw { status: 400, message: "Invalid or inactive range." };
    }
  }

  if (package_group_id) {
    const group = await LotPackageGroup.findOne({
      where: {
        lot_package_group_id: package_group_id,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!group) {
      throw { status: 400, message: "Invalid lot package group." };
    }
  }

  if (facade_id) {
    const facade = await Facade.findOne({
      where: {
        facade_id,
        status: true,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!facade) {
      throw { status: 400, message: "Invalid or inactive facade." };
    }
    if (facade.dwelling_type_id !== dwelling_type_id) {
      throw { status: 400, message: "Facade does not match the provided dwelling type." };
    }
  }

  if (floor_plan_id) {
    const plan = await FloorPlan.findOne({
      where: {
        floor_plan_id,
        status: true,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!plan) {
      throw { status: 400, message: "Invalid or inactive floor plan." };
    }
    if (plan.dwelling_type_id !== dwelling_type_id) {
      throw { status: 400, message: "Floor plan does not match the provided dwelling type." };
    }
  }

  const transaction = await sequelize.transaction();
  try {
    // 4. Creation
    const created = await HouseLandPackage.create(
      {
        company_id: companyId,
        builder_id: builderId,
        title,
        lot_id: lot_id || null,
        dwelling_type_id: dwelling_type_id || null,
        package_group_id: package_group_id || null,
        range_id: range_id || null,
        disclaimer_type: disclaimer_type || "standard",
        floor_plan_id: floor_plan_id || null,
        facade_id: facade_id || null,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    const houseLandPackageId = created.house_land_package_id;

    // 5. Commission Mapping
    const commissions = await JobCommission.findAll({
      attributes: [
        "job_commission_id",
        [sequelize.fn("COALESCE", sequelize.fn("SUM", sequelize.col("subStages.commission_value")), 0), "total_commission"],
      ],
      include: [
        {
          model: JobCommissionSubStage,
          as: "subStages",
          attributes: [],
        },
      ],
      where: {
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
      group: ["JobCommission.job_commission_id"],
      raw: true,
      transaction,
    });

    let initialCommissionTotal = 0;
    for (const comm of commissions) {
      const commValue = parseFloat(comm.total_commission || 0);
      await HLPackageCommissionMap.create(
        {
          house_land_package_id: houseLandPackageId,
          job_commission_id: comm.job_commission_id,
          total_commission: commValue,
        },
        { transaction },
      );
      initialCommissionTotal += commValue;
    }

    // 6. Enriched Fetch (Parity with complex SQL subqueries)
    const enriched = await HouseLandPackage.findOne({
      where: { house_land_package_id: houseLandPackageId },
      include: [
        { model: DwellingType, as: "dwellingType", attributes: ["name"] },
        { model: Range, as: "range", attributes: ["name"] },
        { model: Facade, as: "facade", attributes: ["name", "image"] }, // Facade model has 'image' per SQL
        { model: FloorPlan, as: "floorPlan", attributes: ["name", ["simple_image", "simpleImage"]] }, // floor_plan has 'simple_image'
        { model: Users, as: "createdByUser", attributes: ["name"] },
        {
          model: Lot,
          as: "lot",
          include: [
            { model: Estate, as: "estate", attributes: ["name"] },
            { model: EstateStages, as: "estateStage", attributes: ["name"] },
          ],
        },
      ],
      transaction,
    });

    await transaction.commit();

    // 7. Data Transformation to match formatHouseLandPackageData requirements
    const json = enriched.toJSON();

    // We need to flatten names to match the row structure expected by formatHouseLandPackageData
    const finalData = {
      ...json,
      dwelling_type_name: json.dwellingType?.name || null,
      range_name: json.range?.name || null,
      facade_name: json.facade?.name || null,
      facade_image: json.facade?.image || null,
      floor_plan_name: json.floorPlan?.name || null,
      floor_plan_simple_image: json.floorPlan?.simpleImage || null,
      created_by_name: json.createdByUser?.name || null,
      price_sum: 0, // Per original logic for creation
      commission_sum: initialCommissionTotal,
      lot_details: json.lot ? {
        lot_id: json.lot.lot_id,
        estate_id: json.lot.estate_id,
        estate_name: json.lot.estate?.name || null,
        estate_stage_id: json.lot.estate_stage_id,
        estate_stage_name: json.lot.estateStage?.name || null,
        lot_number: json.lot.lot_number,
        street: json.lot.street,
        city: json.lot.city,
        zip_code: json.lot.zip_code,
        title_status: json.lot.title_status,
        title_date: json.lot.title_date,
        lot_type: json.lot.lot_type,
        corner_block: json.lot.corner_block,
        width_m: json.lot.width_m,
        depth_m: json.lot.depth_m,
        size_m2: json.lot.size_m2,
        price: json.lot.price,
        site_fall_mm: json.lot.site_fall_mm,
        land_fill_mm: json.lot.land_fill_mm,
        total_size_m2: json.lot.total_size_m2,
      } : null,
    };

    return finalData;

  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Retrieves all house land packages with filters and pagination.
 */
export const getAllHouseLandPackagesService = async (params, userContext) => {
  const {
    HouseLandPackage,
    Lot,
    Estate,
    EstateStages,
    DwellingType,
    Range,
    Facade,
    FloorPlan,
    Users,
    TemplateEmail,
    sequelize,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const {
    page = 1,
    limit = 25,
    title,
    lot_address,
    estate_name,
    facade_name,
    floor_plan_name,
    total_price,
    created_date,
    assignee_id,
    lot_id,
  } = params;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  // 1. Build Base Where Clause
  const where = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  if (title) {
    where.title = { [Op.iLike]: `%${title}%` };
  }
  if (lot_id) {
    where.lot_id = lot_id;
  }
  if (assignee_id) {
    where.created_by = assignee_id;
  }

  if (created_date) {
    const dateIntervals = {
      past_7_days: "7 days",
      past_14_days: "14 days",
      past_30_days: "30 days",
    };
    const interval = dateIntervals[created_date];
    if (interval) {
      where.created_at = {
        [Op.gte]: sequelize.literal(`NOW() - INTERVAL '${interval}'`),
      };
    }
  }

  // 2. Build Includes and Join-based filters
  const lotWhere = {};
  if (lot_address) {
    lotWhere[Op.or] = [
      { street: { [Op.iLike]: `%${lot_address}%` } },
      { city: { [Op.iLike]: `%${lot_address}%` } },
    ];
  }

  const estateWhere = {};
  if (estate_name) {
    estateWhere.name = { [Op.iLike]: `%${estate_name}%` };
  }

  const facadeWhere = {};
  if (facade_name) {
    facadeWhere.name = { [Op.iLike]: `%${facade_name}%` };
  }

  const floorPlanWhere = {};
  if (floor_plan_name) {
    floorPlanWhere.name = { [Op.iLike]: `%${floor_plan_name}%` };
  }

  // 3. Computed Columns for Sums
  const priceSumLiteral = sequelize.literal(
    "(SELECT COALESCE(SUM(total_price), 0) FROM h_l_package_pricelist_item_map WHERE house_land_package_id = \"HouseLandPackage\".\"house_land_package_id\")",
  );
  const commissionSumLiteral = sequelize.literal(
    "(SELECT COALESCE(SUM(total_commission), 0) FROM h_l_package_commission_map WHERE house_land_package_id = \"HouseLandPackage\".\"house_land_package_id\")",
  );
  const totalPriceLiteral = sequelize.literal(
    `CAST(TRUNC(
      (SELECT COALESCE(SUM(total_price), 0) FROM h_l_package_pricelist_item_map WHERE house_land_package_id = "HouseLandPackage"."house_land_package_id") +
      (SELECT COALESCE(SUM(total_commission), 0) FROM h_l_package_commission_map WHERE house_land_package_id = "HouseLandPackage"."house_land_package_id") +
      COALESCE("lot"."price", 0)
    ) AS TEXT)`,
  );

  const attributes = {
    include: [
      [priceSumLiteral, "price_sum"],
      [commissionSumLiteral, "commission_sum"],
    ],
  };

  // 4. Having Clause for Total Price
  let having;
  if (total_price) {
    having = sequelize.where(totalPriceLiteral, { [Op.iLike]: `%${total_price}%` });
  }

  // 5. Query
  const { rows, count } = await HouseLandPackage.findAndCountAll({
    where,
    attributes,
    include: [
      {
        model: Lot,
        as: "lot",
        where: Object.keys(lotWhere).length > 0 ? lotWhere : undefined,
        required: Object.keys(lotWhere).length > 0 || estate_name,
        include: [
          {
            model: Estate,
            as: "estate",
            where: Object.keys(estateWhere).length > 0 ? estateWhere : undefined,
            required: Object.keys(estateWhere).length > 0,
            attributes: ["name"],
          },
          {
            model: EstateStages,
            as: "estateStage",
            attributes: ["name"],
          },
        ],
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
        model: Facade,
        as: "facade",
        where: Object.keys(facadeWhere).length > 0 ? facadeWhere : undefined,
        required: Object.keys(facadeWhere).length > 0,
        attributes: ["name", "image"],
      },
      {
        model: FloorPlan,
        as: "floorPlan",
        where: Object.keys(floorPlanWhere).length > 0 ? floorPlanWhere : undefined,
        required: Object.keys(floorPlanWhere).length > 0,
        attributes: ["name", ["simple_image", "simpleImage"]],
      },
      {
        model: Users,
        as: "createdByUser",
        attributes: ["name"],
      },
      {
        model: Users,
        as: "updatedByUser",
        attributes: ["name"],
      },
    ],
    group: [
      "HouseLandPackage.house_land_package_id",
      "lot.lot_id",
      "lot->estate.estate_id",
      "lot->estateStage.estate_stage_id",
      "dwellingType.dwelling_type_id",
      "range.range_id",
      "facade.facade_id",
      "floorPlan.floor_plan_id",
      "createdByUser.users_id",
      "updatedByUser.users_id",
    ],
    having,
    order: [["created_at", "DESC"]],
    limit: limitNum,
    offset,
    distinct: true, // Important for findAndCountAll with includes
  });

  // 6. Data Transformation (Parity with formatHouseLandPackageData)
  const packages = rows.map((pkg) => {
    const json = pkg.toJSON();
    const data = keysToCamelCase(json);

    const priceSum = parseFloat(json.price_sum || 0);
    const commissionSum = parseFloat(json.commission_sum || 0);
    const houseTotal = priceSum + commissionSum;
    const landPrice = parseFloat(json.lot?.price || 0);

    return {
      houseLandPackageId: data.houseLandPackageId,
      companyId: data.companyId,
      builderId: data.builderId,
      title: data.title,

      dwellingType: data.dwellingTypeId ? {
        id: data.dwellingTypeId,
        name: data.dwellingType?.name || null,
      } : null,

      range: data.rangeId ? {
        id: data.rangeId,
        name: data.range?.name || null,
      } : null,

      template: data.templateId ? {
        id: data.templateId,
        name: data.template?.name || null, // Note: standard response uses 'template' key
      } : null,

      facade: data.facadeId ? {
        id: data.facadeId,
        name: data.facade?.name || null,
        image: data.facade?.image || null,
      } : null,

      floorPlan: data.floorPlanId ? {
        id: data.floorPlanId,
        name: data.floorPlan?.name || null,
        simpleImage: data.floorPlan?.simpleImage || null,
      } : null,

      contact: data.contactId ? {
        id: data.contactId,
        name: data.contactName || null, // Note: original SQL had specific contact subqueries
        email: data.contactEmail || null,
        phone: data.contactPhone || null,
      } : null,

      contactShowPdf: data.contactShowPdf || null,

      lotDetails: json.lot ? {
        lotId: json.lot.lot_id,
        estateId: json.lot.estate_id,
        estateName: json.lot.estate?.name || null,
        estateStageId: json.lot.estate_stage_id,
        estateStageName: json.lot.estateStage?.name || null,
        lotNumber: json.lot.lot_number,
        street: json.lot.street,
        city: json.lot.city,
        zipCode: json.lot.zip_code,
        titleStatus: json.lot.title_status,
        titleDate: json.lot.title_date,
        lotType: json.lot.lot_type,
        cornerBlock: json.lot.corner_block,
        widthM: json.lot.width_m,
        depthM: json.lot.depth_m,
        sizeM2: json.lot.size_m2,
        price: json.lot.price,
        siteFallMm: json.lot.site_fall_mm,
        landFillMm: json.lot.land_fill_mm,
        totalSizeM2: json.lot.total_size_m2,
      } : null,

      packageGroupId: data.packageGroupId || null,
      floorPlanDescription: data.floorPlanDescription || null,
      priceType: data.priceType || null,
      landPrice,
      houseTotal,
      commissionTotal: commissionSum,
      totalPrice: houseTotal + landPrice,
      packageDescription: data.packageDescription || null,
      houseFeatureId: data.houseFeatureId || null,
      disclaimerType: data.disclaimerType || null,
      disclaimerDescription: data.disclaimerDescription || null,
      attachFiles: data.attachFiles || [],
      createdByName: json.createdByUser?.name || null,
      createdBy: data.createdBy || null,
      updatedBy: data.updatedBy || null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  });

  return {
    packages,
    total: Array.isArray(count) ? count.length : count, // group queries return array for count
  };
};

/**
 * Retrieves a single house land package by ID with relational enrichment.
 */
export const getHouseLandPackageByIdService = async (id, userContext) => {
  const {
    HouseLandPackage,
    Lot,
    Estate,
    EstateStages,
    DwellingType,
    Range,
    Facade,
    FloorPlan,
    Users,
    TemplateEmail,
    sequelize,
    Sequelize,
  } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const pkg = await HouseLandPackage.findOne({
    where: {
      house_land_package_id: id,
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    },
    attributes: {
      include: [
        [
          sequelize.literal(
            "(SELECT COALESCE(SUM(total_price), 0) FROM h_l_package_pricelist_item_map WHERE house_land_package_id = \"HouseLandPackage\".\"house_land_package_id\")",
          ),
          "price_sum",
        ],
        [
          sequelize.literal(
            "(SELECT COALESCE(SUM(total_commission), 0) FROM h_l_package_commission_map WHERE house_land_package_id = \"HouseLandPackage\".\"house_land_package_id\")",
          ),
          "commission_sum",
        ],
      ],
    },
    include: [
      {
        model: Lot,
        as: "lot",
        include: [
          { model: Estate, as: "estate", attributes: ["name"] },
          { model: EstateStages, as: "estateStage", attributes: ["name"] },
        ],
      },
      { model: DwellingType, as: "dwellingType", attributes: ["name"] },
      { model: Range, as: "range", attributes: ["name"] },
      { model: Facade, as: "facade", attributes: ["name", "image"] },
      { model: FloorPlan, as: "floorPlan", attributes: ["name", ["simple_image", "simpleImage"]] },
      { model: Users, as: "createdByUser", attributes: ["name"] },
      { model: Users, as: "updatedByUser", attributes: ["name"] },
      { model: Users, as: "contact", attributes: ["name", "email", "phone"] },
      { model: TemplateEmail, as: "template", attributes: ["name"] },
    ],
  });

  if (!pkg) {
    throw { status: 404, message: "House land package not found" };
  }

  const json = pkg.toJSON();

  // Transformation to match formatHouseLandPackageData expectations
  return {
    ...json,
    dwelling_type_name: json.dwellingType?.name || null,
    range_name: json.range?.name || null,
    template_name: json.template?.name || null,
    facade_name: json.facade?.name || null,
    facade_image: json.facade?.image || null,
    floor_plan_name: json.floorPlan?.name || null,
    floor_plan_simple_image: json.floorPlan?.simpleImage || null,
    contact_name: json.contact?.name || null,
    contact_email: json.contact?.email || null,
    contact_phone: json.contact?.phone || null,
    created_by_name: json.createdByUser?.name || null,
    lot_details: json.lot ? {
      lot_id: json.lot.lot_id,
      estate_id: json.lot.estate_id,
      estate_name: json.lot.estate?.name || null,
      estate_stage_id: json.lot.estate_stage_id,
      estate_stage_name: json.lot.estateStage?.name || null,
      lot_number: json.lot.lot_number,
      street: json.lot.street,
      city: json.lot.city,
      zip_code: json.lot.zip_code,
      title_status: json.lot.title_status,
      title_date: json.lot.title_date,
      lot_type: json.lot.lot_type,
      corner_block: json.lot.corner_block,
      width_m: json.lot.width_m,
      depth_m: json.lot.depth_m,
      size_m2: json.lot.size_m2,
      price: json.lot.price,
      site_fall_mm: json.lot.site_fall_mm,
      land_fill_mm: json.lot.land_fill_mm,
      total_size_m2: json.lot.total_size_m2,
    } : null,
  };
};

/**
 * Updates an existing house land package with validations, file handling, and relational enrichment.
 */
export const updateHouseLandPackageService = async ({
  houseLandPackageId,
  userId,
  builderId,
  companyId,
  data,
  files,
}) => {
  const {
    HouseLandPackage,
    Lot,
    DwellingType,
    Range,
    LotPackageGroup,
    LotPackage,
    Facade,
    FloorPlan,
    Users,
    Role,
    Estate,
    EstateStages,
    TemplateEmail,
    HouseFeature,
    HLPackagePricelistItemMap,
    HLPackageCommissionMap,
    sequelize,
    Sequelize,
  } = db;
  const { Op } = Sequelize;

  // 1. Authorization & Existence Check
  if (!userId || (!builderId && !companyId)) {
    throw { status: 401, message: "Unauthorized: User must belong to either a builder or company" };
  }

  const existingPackage = await HouseLandPackage.findOne({
    where: {
      house_land_package_id: houseLandPackageId,
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    },
  });

  if (!existingPackage) {
    throw { status: 404, message: "House land package not found" };
  }

  // 2. Field Restriction Check
  const restrictedFields = ["company_id", "builder_id", "created_by", "created_at"];
  const attemptedRestrictedUpdates = restrictedFields.filter(f => data[f] !== undefined);
  if (attemptedRestrictedUpdates.length > 0) {
    throw { status: 400, message: `Cannot update restricted fields: ${attemptedRestrictedUpdates.join(", ")}` };
  }

  // 3. Validations
  if (data.lot_id) {
    const lot = await Lot.findOne({
      where: {
        lot_id: data.lot_id,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!lot) {
      throw { status: 400, message: "Invalid lot_id or lot not found." };
    }
  }

  if (data.contact_id) {
    const contact = await Users.findOne({
      where: { users_id: data.contact_id, is_deleted: false, is_active: true },
      include: [{ model: Role, as: "role", where: { name: "Contact" } }],
    });
    if (!contact) {
      throw { status: 400, message: "Invalid contact_id or user does not have the 'Contact' role or is inactive." };
    }
  }

  if (data.dwelling_type_id) {
    const dt = await DwellingType.findOne({
      where: {
        dwelling_type_id: data.dwelling_type_id,
        is_active: true,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!dt) {
      throw { status: 400, message: "Invalid or inactive dwelling type." };
    }
  }

  if (data.range_id) {
    const range = await Range.findOne({
      where: {
        range_id: data.range_id,
        is_active: true,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!range) {
      throw { status: 400, message: "Invalid or inactive range." };
    }
  }

  if (data.floor_plan_id) {
    const plan = await FloorPlan.findOne({
      where: {
        floor_plan_id: data.floor_plan_id,
        status: true,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!plan) {
      throw { status: 400, message: "Invalid floor_plan_id or inactive." };
    }
  }

  if (data.facade_id) {
    const facade = await Facade.findOne({
      where: {
        facade_id: data.facade_id,
        status: true,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!facade) {
      throw { status: 400, message: "Invalid facade_id or inactive." };
    }
  }

  if (data.package_group_id) {
    const group = await LotPackageGroup.findOne({
      where: {
        lot_package_group_id: data.package_group_id,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!group) {
      throw { status: 400, message: "Invalid package_group_id or group not found." };
    }

    const finalLotId = data.lot_id || existingPackage.lot_id;
    if (finalLotId) {
      const mapping = await LotPackage.findOne({
        where: { lot_id: finalLotId, lot_package_group_id: data.package_group_id },
      });
      if (!mapping) {
        throw { status: 400, message: "The selected package group does not contain any packages for this lot." };
      }
    }
  }

  if (data.house_feature_id) {
    const feature = await HouseFeature.findOne({
      where: {
        house_feature_id: data.house_feature_id,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
    });
    if (!feature) {
      throw { status: 400, message: "Invalid house_feature_id or feature not found." };
    }
  }

  // 4. File Handling
  let uploadedFiles = [];
  if (Array.isArray(files)) {
    uploadedFiles = files.map(f => f.location);
  } else if (files && typeof files === "object") {
    uploadedFiles = [
      ...(files.attachFiles || []),
      ...(files.attach_files || []),
      ...(files.attach_Files || []),
    ].map(f => f.location);
  }
  uploadedFiles = uploadedFiles.filter(Boolean);
  let updatedFiles = Array.isArray(existingPackage.attach_files)
    ? [...existingPackage.attach_files]
    : (existingPackage.attach_files ? [existingPackage.attach_files] : []);

  if (uploadedFiles.length > 0) {
    const MAX_ATTACH_FILES = 10;
    updatedFiles = [...updatedFiles, ...uploadedFiles];

    while (updatedFiles.length > MAX_ATTACH_FILES) {
      const removedFile = updatedFiles.shift();
      if (removedFile?.startsWith("http")) {
        try {
          await deleteFromS3(removedFile);
        } catch (err) {
          console.error(`Error deleting old file from S3: ${removedFile}`, err.message);
        }
      }
    }
  } else if (data.attach_files !== undefined) {
    // Sanitize input to ensure only valid URL strings are kept
    if (Array.isArray(data.attach_files)) {
      updatedFiles = data.attach_files.filter(f => typeof f === "string" && f.startsWith("http"));
    } else if (typeof data.attach_files === "string") {
      if (data.attach_files.startsWith("http")) {
        updatedFiles = [data.attach_files];
      } else if (data.attach_files === "" || data.attach_files === "[]") {
        updatedFiles = [];
      }
    }
  }

  const transaction = await sequelize.transaction();
  try {
    // 5. Update
    const allowedFields = [
      "title", "range_id", "dwelling_type_id", "template_id", "contact_id",
      "contact_show_pdf", "lot_id", "price_type", "floor_plan_id",
      "floor_plan_description", "facade_id", "package_group_id",
      "package_description", "house_feature_id", "disclaimer_type", "disclaimer_description",
    ];

    const updateBody = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateBody[field] = data[field];
      }
    }
    updateBody.attach_files = updatedFiles;
    updateBody.updated_by = userId;

    await HouseLandPackage.update(updateBody, {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });

    // 6. Final Fetch & Enrichment (Parity with complex SQL)
    const enriched = await HouseLandPackage.findOne({
      where: { house_land_package_id: houseLandPackageId },
      include: [
        { model: DwellingType, as: "dwellingType", attributes: ["name"] },
        { model: Range, as: "range", attributes: ["name"] },
        { model: Facade, as: "facade", attributes: ["name", "image"] },
        { model: FloorPlan, as: "floorPlan", attributes: ["name", ["simple_image", "simpleImage"]] },
        { model: Users, as: "createdByUser", attributes: ["name"] },
        {
          model: Lot,
          as: "lot",
          include: [
            { model: Estate, as: "estate", attributes: ["name"] },
            { model: EstateStages, as: "estateStage", attributes: ["name"] },
          ],
        },
      ],
      transaction,
    });

    const priceSum = await HLPackagePricelistItemMap.sum("total_price", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });
    const commissionSum = await HLPackageCommissionMap.sum("total_commission", {
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });

    await transaction.commit();

    const json = enriched.toJSON();
    return {
      ...json,
      dwelling_type_name: json.dwellingType?.name || null,
      range_name: json.range?.name || null,
      facade_name: json.facade?.name || null,
      facade_image: json.facade?.image || null,
      floor_plan_name: json.floorPlan?.name || null,
      floor_plan_simple_image: json.floorPlan?.simpleImage || null,
      created_by_name: json.createdByUser?.name || null,
      price_sum: parseFloat(priceSum || 0),
      commission_sum: parseFloat(commissionSum || 0),
      lot_details: json.lot ? {
        lot_id: json.lot.lot_id,
        estate_id: json.lot.estate_id,
        estate_name: json.lot.estate?.name || null,
        estate_stage_id: json.lot.estate_stage_id,
        estate_stage_name: json.lot.estateStage?.name || null,
        lot_number: json.lot.lot_number,
        street: json.lot.street,
        city: json.lot.city,
        zip_code: json.lot.zip_code,
        title_status: json.lot.title_status,
        title_date: json.lot.title_date,
        lot_type: json.lot.lot_type,
        corner_block: json.lot.corner_block,
        width_m: json.lot.width_m,
        depth_m: json.lot.depth_m,
        size_m2: json.lot.size_m2,
        price: json.lot.price,
        site_fall_mm: json.lot.site_fall_mm,
        land_fill_mm: json.lot.land_fill_mm,
        total_size_m2: json.lot.total_size_m2,
      } : null,
    };

  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Deletes a house land package, cleans up associated S3 files, and handles database removal.
 */
export const deleteHouseLandPackageService = async (houseLandPackageId, userContext) => {
  const { HouseLandPackage, sequelize, Sequelize } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const existingPackage = await HouseLandPackage.findOne({
    where: {
      house_land_package_id: houseLandPackageId,
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    },
  });

  if (!existingPackage) {
    throw { status: 404, message: "House land package not found" };
  }

  const transaction = await sequelize.transaction();
  try {
    // 1. Cleanup Files from S3
    if (existingPackage.attach_files && existingPackage.attach_files.length > 0) {
      for (const fileUrl of existingPackage.attach_files) {
        if (fileUrl) {
          try {
            await deleteFromS3(fileUrl);
          } catch (err) {
            console.error(`Error deleting file from S3 during package deletion: ${fileUrl}`, err.message);
          }
        }
      }
    }

    // 2. Database Deletion
    await HouseLandPackage.destroy({
      where: { house_land_package_id: houseLandPackageId },
      transaction,
    });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

export default {
  createHouseLandPackageService,
  getAllHouseLandPackagesService,
  updateHouseLandPackageService,
  deleteHouseLandPackageService,
};
