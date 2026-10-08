import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Fetches holidays with complex filtering and pagination.
 */
export const getAllHolidaysService = async ({ companyId, builderId, query }) => {
  const { Holiday, State, Sequelize } = db;
  const { Op } = Sequelize;

  const {
    page = 1,
    limit = 10,
    state,
    holiday_start_date,
    holiday_end_date,
    holiday_description,
    status,
    year,
  } = query;

  const pageValue = parseInt(page) || 1;
  const limitValue = parseInt(limit) || 10;
  const offset = (pageValue - 1) * limitValue;

  // Build Where Clause
  const where = {
    [Op.or]: [
      { company_id: companyId || null },
      { builder_id: builderId || null },
    ],
  };

  if (state) {
    const statesArray = state.split(",");
    where.state = { [Op.overlap]: statesArray };
  }

  if (holiday_start_date) {
    where.holiday_start_date = { [Op.gte]: holiday_start_date };
  }

  if (holiday_end_date) {
    where.holiday_end_date = { [Op.lte]: holiday_end_date };
  }

  if (holiday_description) {
    where.holiday_description = { [Op.iLike]: `%${holiday_description}%` };
  }

  if (year) {
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;
    // Overlap: h.holiday_start_date <= endOfYear AND h.holiday_end_date >= startOfYear
    where[Op.and] = [
      { holiday_start_date: { [Op.lte]: endOfYear } },
      { holiday_end_date: { [Op.gte]: startOfYear } },
    ];
  }

  // `status` is declared as Joi.boolean().default(true) on getAllHolidaySchema,
  // and validateRequest writes the coerced value back onto req.query — so this
  // arrives as a real boolean, not the raw query string. The previous
  // `status === "true"` compared a boolean against a string, which is always
  // false, so every listing ran `WHERE status = false` and returned nothing
  // even though holidays are created with status true.
  if (status !== undefined) {
    where.status = typeof status === "boolean" ? status : String(status) === "true";
  }

  // Fetch Holidays
  const { count: totalRecords, rows: holidays } = await Holiday.findAndCountAll({
    where,
    limit: limitValue,
    offset,
    order: [["created_at", "DESC"]],
  });

  const totalPages = Math.ceil(totalRecords / limitValue);

  // Resolve State Names from the UUID array field
  const allStateIdsSet = new Set();
  holidays.forEach((h) => {
    if (Array.isArray(h.state)) {
      h.state.forEach((id) => allStateIdsSet.add(id));
    }
  });

  const allStateIds = Array.from(allStateIdsSet);
  const stateMap = {};

  if (allStateIds.length > 0) {
    const states = await State.findAll({
      where: { state_id: { [Op.in]: allStateIds } },
      attributes: ["state_id", "name"],
    });

    states.forEach((s) => {
      stateMap[s.state_id] = { id: s.state_id, name: s.name };
    });
  }

  // Map results to legacy format
  const formattedHolidays = holidays.map((h) => {
    const item = h.get({ plain: true });

    // Convert UUID array back to objects to match json_agg(jsonb_build_object(...))
    const resolvedStates = (item.state || [])
      .map((id) => stateMap[id])
      .filter(Boolean);

    return {
      ...keysToCamelCase(item),
      state: resolvedStates,
    };
  });

  return {
    holidays: formattedHolidays,
    pagination: {
      currentPage: pageValue,
      totalPages,
      totalRecords,
      limit: limitValue,
    },
  };
};

/**
 * Creates a new holiday with state validation.
 */
export const createHolidayService = async ({ companyId, builderId, userId, data }) => {
  const { Holiday, State, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  const { state, holiday_start_date, holiday_end_date, holiday_description } = data;

  if (!companyId && !builderId) {
    const error = new Error("Either company_id or builder_id must be present.");
    error.status = 400;
    throw error;
  }

  const isValidDate = (dateString) => {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  };

  if (holiday_start_date && !isValidDate(holiday_start_date)) {
    const error = new Error(`Invalid date: ${holiday_start_date}`);
    error.status = 400;
    throw error;
  }

  if (holiday_end_date && !isValidDate(holiday_end_date)) {
    const error = new Error(`Invalid date: ${holiday_end_date}`);
    error.status = 400;
    throw error;
  }

  if (new Date(holiday_start_date) > new Date(holiday_end_date)) {
    const error = new Error("holiday_start_date cannot be greater than holiday_end_date.");
    error.status = 400;
    throw error;
  }

  const transaction = await sequelize.transaction();
  try {
    // 1. State validation
    if (state && Array.isArray(state) && state.length > 0) {
      const validStatesCount = await State.count({
        where: { state_id: { [Op.in]: state } },
        transaction,
      });

      if (validStatesCount !== state.length) {
        const error = new Error("One or more state IDs are invalid.");
        error.status = 400;
        throw error;
      }
    }

    // 2. Create holiday
    const holiday = await Holiday.create({
      company_id: companyId || null,
      builder_id: builderId || null,
      state: state || [],
      holiday_start_date,
      holiday_end_date,
      holiday_description,
      created_by: userId,
      updated_by: userId,
    }, { transaction });

    // 3. Resolve state details for response
    let resolvedStates = [];
    if (state && state.length > 0) {
      const states = await State.findAll({
        where: { state_id: { [Op.in]: state } },
        attributes: ["state_id", "name"],
        transaction,
      });
      resolvedStates = states.map(s => ({
        id: s.state_id,
        name: s.name,
      }));
    }

    await transaction.commit();

    const result = holiday.toJSON();
    return {
      ...keysToCamelCase(result),
      state: resolvedStates,
    };
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Updates an existing holiday with merged date validation and state resolution.
 */
export const updateHolidayService = async ({ companyId, builderId, holidayId, userId, data }) => {
  const { Holiday, State, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  const {
    state,
    holiday_start_date,
    holiday_end_date,
    holiday_description,
    status,
  } = data;

  const transaction = await sequelize.transaction();
  try {
    // 1. Fetch and Lock existing holiday
    const existing = await Holiday.findOne({
      where: {
        holiday_id: holidayId,
        company_id: companyId,
        builder_id: builderId,
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!existing) {
      const error = new Error("Holiday not found.");
      error.status = 404;
      throw error;
    }

    // 2. Validations: Status
    if (status !== undefined && typeof status !== "boolean") {
      const error = new Error("The 'status' field must be a boolean (true or false).");
      error.status = 400;
      throw error;
    }

    // 3. Validations: State
    let stateArray = state;
    if (state) {
      stateArray = typeof state === "string" ? state.split(",") : state;
      const validStatesCount = await State.count({
        where: { state_id: { [Op.in]: stateArray } },
        transaction,
      });

      if (validStatesCount !== stateArray.length) {
        const error = new Error("One or more state ids are invalid.");
        error.status = 400;
        throw error;
      }
    }

    // 4. Validations: Dates (Merged)
    const checkStartDate = holiday_start_date || existing.holiday_start_date;
    const checkEndDate = holiday_end_date || existing.holiday_end_date;

    if (new Date(checkStartDate) > new Date(checkEndDate)) {
      const error = new Error("holiday_end_date cannot be earlier than holiday_start_date.");
      error.status = 400;
      throw error;
    }

    // 5. Check if any fields provided
    const fieldsToUpdate = [
      "state",
      "holiday_start_date",
      "holiday_end_date",
      "holiday_description",
      "status",
    ];

    const isUpdating = fieldsToUpdate.some((field) => data.hasOwnProperty(field));
    if (!isUpdating) {
      const error = new Error("No fields provided for update.");
      error.status = 400;
      throw error;
    }

    // 6. Execute update
    const updateData = {
      updated_by: userId,
    };
    if (state !== undefined) {
      updateData.state = stateArray;
    }
    if (holiday_start_date !== undefined) {
      updateData.holiday_start_date = holiday_start_date;
    }
    if (holiday_end_date !== undefined) {
      updateData.holiday_end_date = holiday_end_date;
    }
    if (holiday_description !== undefined) {
      updateData.holiday_description = holiday_description;
    }
    if (status !== undefined) {
      updateData.status = status;
    }

    await existing.update(updateData, { transaction });

    // 7. Resolve state details for response
    const finalStateIds = updateData.state || existing.state || [];
    let resolvedStates = [];
    if (finalStateIds.length > 0) {
      const states = await State.findAll({
        where: { state_id: { [Op.in]: finalStateIds } },
        attributes: ["state_id", "name"],
        transaction,
      });
      resolvedStates = states.map((s) => ({
        id: s.state_id,
        name: s.name,
      }));
    }

    await transaction.commit();

    const result = existing.toJSON();
    return {
      ...keysToCamelCase(result),
      state: resolvedStates,
    };
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

export default {
  getAllHolidaysService,
  createHolidayService,
  updateHolidayService,
};
