import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Fetches a lot by ID with builder/company scoping and relational data.
 */
export const getLotByIdService = async ({ lotId, builderId, companyId }) => {
  const { Lot, Estate, EstateStages, Users, Sequelize } = db;
  const { Op } = Sequelize;

  // 1. Authorization check (Parity with legacy)
  if (!builderId && !companyId) {
    const error = new Error("Unauthorized: User must belong to either a builder or company");
    error.status = 401;
    throw error;
  }

  // 2. Fetch with Scoping and Includes
  const lot = await Lot.findOne({
    where: {
      lot_id: lotId,
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    },
    include: [
      {
        model: Estate,
        as: "estate",
        attributes: ["estate_id", "name"],
      },
      {
        model: EstateStages,
        as: "estateStage",
        attributes: ["estate_stage_id", "name"],
      },
      {
        model: Users,
        as: "createdByUser",
        attributes: ["name"],
      },
    ],
  });

  if (!lot) {
    return null;
  }

  const lotJson = lot.toJSON();

  // 3. Transformation to match legacy SQL structure logic
  const formattedData = {
    ...lotJson,
    estate: lotJson.estate
      ? { id: lotJson.estate.estate_id, name: lotJson.estate.name }
      : null,
    estate_stage: lotJson.estateStage
      ? { id: lotJson.estateStage.estate_stage_id, name: lotJson.estateStage.name }
      : null,
    created_by_name: lotJson.createdByUser?.name || null,
  };

  // Remove keys mapped to nested objects manually to avoid duplication after camelCase
  delete formattedData.estateStage;
  delete formattedData.createdByUser;

  // 4. CamelCase and Cleanup (match legacy delete logic)
  const result = keysToCamelCase(formattedData);
  delete result.estateId;
  delete result.estateStageId;

  return result;
};

/**
 * Creates a new lot with complex validation, scoping, and relational data enrichment.
 */
export const createLotService = async ({ userId, builderId, companyId, data }) => {
  const { Lot, Estate, EstateStages, State, Users, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  const {
    estate_id,
    estate_stage_id,
    lot_number,
    street,
    city,
    state_id,
    zip_code,
    title_status,
    title_date,
    lot_type,
    corner_block,
    width_m,
    depth_m,
    price,
    site_fall_mm,
    land_fill_mm,
    total_size_m2,
  } = data;

  // 1. Authorization check
  if (!userId || (!builderId && !companyId)) {
    const error = new Error("Unauthorized: User must belong to either a builder or company");
    error.status = 401;
    throw error;
  }

  const transaction = await sequelize.transaction();
  try {
    // 2. State Validation
    if (state_id) {
      const state = await State.findByPk(state_id, { transaction });
      if (!state) {
        const error = new Error("Invalid state_id.");
        error.status = 400;
        throw error;
      }
    }

    // 3. Estate & Stage Validation
    if (estate_stage_id && !estate_id) {
      const error = new Error("estate_id is required when estate_stage_id is provided.");
      error.status = 400;
      throw error;
    }

    if (estate_id) {
      const estate = await Estate.findOne({
        where: {
          estate_id,
          [Op.or]: [
            { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
            { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
          ],
          status: true,
        },
        transaction,
      });

      if (!estate) {
        const error = new Error("Invalid estate_id or estate not found for this builder.");
        error.status = 400;
        throw error;
      }
    }

    if (estate_stage_id) {
      const stage = await EstateStages.findOne({
        where: { estate_stage_id },
        include: [
          {
            model: Estate,
            as: "estate",
            where: {
              [Op.or]: [
                { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
                { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
              ],
              status: true,
            },
            required: true,
          },
        ],
        transaction,
      });

      if (!stage) {
        const error = new Error("Invalid estate_stage_id or estate stage not found.");
        error.status = 400;
        throw error;
      }

      if (stage.estate_id !== estate_id) {
        const error = new Error("Estate stage does not belong to the provided estate.");
        error.status = 400;
        throw error;
      }
    }

    // 4. Duplicate Check
    const duplicate = await Lot.findOne({
      where: {
        lot_number,
        [Op.or]: [
          { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
          { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
        ],
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error(`Lot number ${lot_number} already exists in this organization.`);
      error.status = 400;
      throw error;
    }

    // 5. Creation
    const created = await Lot.create(
      {
        company_id: companyId,
        builder_id: builderId,
        estate_id: estate_id || null,
        estate_stage_id: estate_stage_id || null,
        lot_number,
        street,
        city,
        state_id: state_id || null,
        zip_code,
        title_status: title_status || null,
        title_date: title_date || null,
        lot_type: lot_type || "regular",
        corner_block: corner_block || false,
        width_m: width_m || null,
        depth_m: depth_m || null,
        price: price || null,
        site_fall_mm: site_fall_mm || null,
        land_fill_mm: land_fill_mm || null,
        total_size_m2: total_size_m2 || null,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    // 6. Fetch Enriched Data (Parity with RETURNING subqueries)
    const enriched = await Lot.findOne({
      where: { lot_id: created.lot_id },
      include: [
        {
          model: Estate,
          as: "estate",
          attributes: ["estate_id", "name"],
        },
        {
          model: EstateStages,
          as: "estateStage",
          attributes: ["estate_stage_id", "name"],
        },
        {
          model: Users,
          as: "createdByUser",
          attributes: ["name"],
        },
      ],
      transaction,
    });

    await transaction.commit();

    // 7. Transformation
    const lotJson = enriched.toJSON();
    const formatted = {
      ...lotJson,
      estate: lotJson.estate ? { id: lotJson.estate.estate_id, name: lotJson.estate.name } : null,
      estate_stage: lotJson.estateStage ? { id: lotJson.estateStage.estate_stage_id, name: lotJson.estateStage.name } : null,
      created_by_name: lotJson.createdByUser?.name || null,
    };

    delete formatted.estateStage;
    delete formatted.createdByUser;

    const result = keysToCamelCase(formatted);
    delete result.estateId;
    delete result.estateStageId;

    return result;
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Updates a lot with scope checks, hierarchical validation, and duplicate checks.
 */
export const updateLotService = async ({ lotId, userId, builderId, companyId, data }) => {
  const { Lot, Estate, EstateStages, State, Users, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  // 1. Authorization check
  if (!userId || (!builderId && !companyId)) {
    const error = new Error("Unauthorized: User must belong to either a builder or company");
    error.status = 401;
    throw error;
  }

  // 2. Fetch current lot for scoping and existing data
  const currentLot = await Lot.findOne({
    where: {
      lot_id: lotId,
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    },
  });

  if (!currentLot) {
    const error = new Error("Lot not found");
    error.status = 404;
    throw error;
  }

  const transaction = await sequelize.transaction();
  try {
    // 3. State Validation
    if (data.state_id) {
      const state = await State.findByPk(data.state_id, { transaction });
      if (!state) {
        throw { status: 400, message: "Invalid state_id." };
      }
    }

    // 4. Estate & Stage Validation
    if (data.estate_id) {
      // Per original logic: estate_stage_id is REQUIRED when updating estate_id
      if (!data.estate_stage_id) {
        throw { status: 400, message: "estate_stage_id is required when updating estate_id." };
      }

      const estate = await Estate.findOne({
        where: {
          estate_id: data.estate_id,
          [Op.or]: [
            { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
            { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
          ],
          status: true,
        },
        transaction,
      });

      if (!estate) {
        throw { status: 400, message: "Invalid estate_id or estate not found for this builder." };
      }
    }

    if (data.estate_stage_id) {
      const stage = await EstateStages.findOne({
        where: { estate_stage_id: data.estate_stage_id },
        include: [
          {
            model: Estate,
            as: "estate",
            where: {
              [Op.or]: [
                { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
                { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
              ],
              status: true,
            },
            required: true,
          },
        ],
        transaction,
      });

      if (!stage) {
        throw { status: 400, message: "Invalid estate_stage_id or estate stage not found." };
      }

      const finalEstateId = data.estate_id || currentLot.estate_id;
      if (!finalEstateId) {
        throw { status: 400, message: "estate_id is required (either provided or already existing) when estate_stage_id is set." };
      }

      if (stage.estate_id !== finalEstateId) {
        throw { status: 400, message: "Estate stage does not belong to the provided/existing estate." };
      }
    }

    // 5. Duplicate Check
    if (data.lot_number !== undefined) {
      const duplicate = await Lot.findOne({
        where: {
          lot_number: data.lot_number,
          lot_id: { [Op.ne]: lotId },
          [Op.or]: [
            { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
            { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
          ],
        },
        transaction,
      });

      if (duplicate) {
        throw { status: 400, message: `Lot number ${data.lot_number} already exists in this organization.` };
      }
    }

    // 6. Execution
    await currentLot.update(
      {
        ...data,
        updated_by: userId,
      },
      { transaction },
    );

    // 7. Fetch Enriched Result (Parity with RETURNING subqueries)
    const updated = await Lot.findOne({
      where: { lot_id: lotId },
      include: [
        {
          model: Estate,
          as: "estate",
          attributes: ["estate_id", "name"],
        },
        {
          model: EstateStages,
          as: "estateStage",
          attributes: ["estate_stage_id", "name"],
        },
        {
          model: Users,
          as: "createdByUser",
          attributes: ["name"],
        },
      ],
      transaction,
    });

    await transaction.commit();

    // 8. Transformation
    const lotJson = updated.toJSON();
    const formatted = {
      ...lotJson,
      estate: lotJson.estate ? { id: lotJson.estate.estate_id, name: lotJson.estate.name } : null,
      estate_stage: lotJson.estateStage ? { id: lotJson.estateStage.estate_stage_id, name: lotJson.estateStage.name } : null,
      created_by_name: lotJson.createdByUser?.name || null,
    };

    delete formatted.estateStage;
    delete formatted.createdByUser;

    const result = keysToCamelCase(formatted);
    delete result.estateId;
    delete result.estateStageId;

    return result;
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Retrieves all lots with complex filtering, relational joins, and result transformation.
 */
export const getAllLotsService = async ({ builderId, companyId, query }) => {
  const { Lot, Estate, EstateStages, Users, Sequelize } = db;
  const { Op } = Sequelize;

  // 1. Authorization check
  if (!builderId && !companyId) {
    const error = new Error("Unauthorized: User must belong to either a builder or company");
    error.status = 401;
    throw error;
  }

  const {
    lot_number,
    price,
    size,
    estate_name,
    stage_name,
    address,
    status,
    created_date,
    created_by,
  } = query;

  // 2. Build Where Conditions
  const where = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  if (lot_number) {
    where.lot_number = { [Op.iLike]: `%${lot_number}%` };
  }

  if (price) {
    // Parity with: CAST(TRUNC(COALESCE(l.price, 0)) AS TEXT) LIKE %price%
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(
      Sequelize.where(
        Sequelize.cast(Sequelize.fn("TRUNC", Sequelize.fn("COALESCE", Sequelize.col("Lot.price"), 0)), "TEXT"),
        { [Op.like]: `%${price}%` },
      ),
    );
  }

  if (size) {
    // Parity with: CAST(TRUNC(COALESCE(l.total_size_m2, 0)) AS TEXT) LIKE %size%
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(
      Sequelize.where(
        Sequelize.cast(Sequelize.fn("TRUNC", Sequelize.fn("COALESCE", Sequelize.col("Lot.total_size_m2"), 0)), "TEXT"),
        { [Op.like]: `%${size}%` },
      ),
    );
  }

  if (status) {
    where.title_status = status;
  }

  if (created_by) {
    where.created_by = created_by;
  }

  if (created_date) {
    const dateIntervals = {
      past_7_days: "7 days",
      past_14_days: "14 days",
      past_30_days: "30 days",
    };
    const interval = dateIntervals[created_date];
    if (interval) {
      where.createdAt = {
        [Op.gte]: Sequelize.literal(`NOW() - INTERVAL '${interval}'`),
      };
    }
  }

  if (address) {
    const addressSearch = {
      [Op.or]: [
        { street: { [Op.iLike]: `%${address}%` } },
        { city: { [Op.iLike]: `%${address}%` } },
        Sequelize.where(Sequelize.fn("concat", Sequelize.col("Lot.street"), ", ", Sequelize.col("Lot.city")), {
          [Op.iLike]: `%${address}%`,
        }),
        Sequelize.where(Sequelize.fn("concat", Sequelize.col("Lot.street"), " ", Sequelize.col("Lot.city")), {
          [Op.iLike]: `%${address}%`,
        }),
        Sequelize.where(Sequelize.fn("concat", Sequelize.col("Lot.street"), ",", Sequelize.col("Lot.city")), {
          [Op.iLike]: `%${address}%`,
        }),
      ],
    };

    // Use [Op.and] to ensure search filters don't merge with top-level scoping [Op.or]
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(addressSearch);
  }

  // 3. Define Includes
  const include = [
    {
      model: Estate,
      as: "estate",
      attributes: ["estate_id", "name"],
      where: estate_name ? { name: { [Op.iLike]: `%${estate_name}%` } } : {},
      required: !!estate_name,
    },
    {
      model: EstateStages,
      as: "estateStage",
      attributes: ["estate_stage_id", "name"],
      where: stage_name ? { name: { [Op.iLike]: `%${stage_name}%` } } : {},
      required: !!stage_name,
    },
    {
      model: Users,
      as: "createdByUser",
      attributes: ["name"],
      required: false,
    },
  ];

  // 4. Execution
  const lots = await Lot.findAll({
    where,
    include,
    order: [["created_at", "DESC"]],
  });

  // 5. Transformation to match legacy SQL structure
  return lots.map((lot) => {
    const lotJson = lot.toJSON();
    const formatted = {
      ...lotJson,
      estate: lotJson.estate ? { id: lotJson.estate.estate_id, name: lotJson.estate.name } : null,
      estate_stage: lotJson.estateStage ? { id: lotJson.estateStage.estate_stage_id, name: lotJson.estateStage.name } : null,
      created_by_name: lotJson.createdByUser?.name || null,
    };

    delete formatted.estateStage;
    delete formatted.createdByUser;

    const result = keysToCamelCase(formatted);
    delete result.estateId;
    delete result.estateStageId;

    return result;
  });
};

/**
 * Deletes a lot with scope check.
 */
export const deleteLotService = async ({ lotId, builderId, companyId }) => {
  const { Lot, Sequelize } = db;
  const { Op } = Sequelize;

  if (!builderId && !companyId) {
    const error = new Error("Unauthorized: User must belong to either a builder or company");
    error.status = 401;
    throw error;
  }

  const lot = await Lot.findOne({
    where: {
      lot_id: lotId,
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    },
  });

  if (!lot) {
    const error = new Error("Lot not found");
    error.status = 404;
    throw error;
  }

  return await lot.destroy();
};

export default {
  getLotByIdService,
  createLotService,
  updateLotService,
  getAllLotsService,
  deleteLotService,
};
