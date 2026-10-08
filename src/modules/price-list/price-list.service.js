import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/** Scope condition: match BOTH company_id AND builder_id (original uses AND for ownership) */
const ownerScope = (companyId, builderId) => ({
  company_id: companyId,
  builder_id: builderId,
});

/** Default price list seed rows inserted on first fetch */
const DEFAULT_PRICE_LISTS = [
  "Standard Package",
  "Premium Package",
  "Deluxe Package",
  "Basic Package",
  "Custom Package",
  "Economy Package",
  "Luxury Package",
  "Executive Package",
  "Family Package",
  "Business Package",
].map((name) => ({
  name,
  show_in_view_list: true,
  is_active: true,
  is_suggested: true,
}));

// ─── SERVICE: CREATE PRICE LIST ───────────────────────────────────────────────

/**
 * Creates a new PriceList row.
 * Validates unique name, sort_order range, shifts existing rows, validates location.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function createPriceListService({
  companyId,
  builderId,
  userId,
  name,
  sort_order = 0,
  show_in_view_list = true,
  location,
}) {
  const { PriceList, Location, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Duplicate name check ───────────────────────────────────────────────
    const duplicate = await PriceList.findOne({
      where: { name: name.trim(), is_sample_data: false, ...ownerScope(companyId, builderId) },
      attributes: ["price_list_id"],
      transaction,
    });

    if (duplicate) {
      await transaction.rollback();
      return { error: { status: 400, message: "Name already exists." } };
    }

    // ── Sort order handling ────────────────────────────────────────────────
    const maxSortOrder = await PriceList.max("sort_order", {
      where: ownerScope(companyId, builderId),
      transaction,
    }) ?? 0;

    const finalSortOrder = maxSortOrder + 1;

    // ── Validate location ──────────────────────────────────────────────────
    if (location) {
      const validLocation = await Location.findOne({
        where: { location_id: location, status: true },
        attributes: ["location_id"],
        transaction,
      });

      if (!validLocation) {
        await transaction.rollback();
        return {
          error: { status: 400, message: "Invalid location. Location does not exist." },
        };
      }
    }

    // ── Insert ─────────────────────────────────────────────────────────────
    const created = await PriceList.create(
      {
        company_id: companyId,
        builder_id: builderId,
        name: name.trim(),
        sort_order: finalSortOrder,
        show_in_view_list,
        location,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    return { data: keysToCamelCase(created.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: GET ALL PRICE LISTS ────────────────────────────────────────────

/**
 * Fetches paginated PriceLists for the builder/company.
 * Auto-seeds 10 default rows if none exist yet.
 * Supports filtering by is_active, is_suggested, search, and location_id.
 *
 * @returns {{ data: object }}
 */
export async function getAllPriceListService({
  companyId,
  builderId,
  userId,
  page = 1,
  limit = 25,
  is_active,
  is_suggested,
  search,
  location_id,
}) {
  const { PriceList, sequelize } = db;

  const pageValue = parseInt(page, 10);
  const limitValue = parseInt(limit, 10);
  const offset = (pageValue - 1) * limitValue;

  // ── Auto-seed defaults if no rows exist ───────────────────────────────
  const existing = await PriceList.findOne({
    where: ownerScope(companyId, builderId),
    attributes: ["price_list_id"],
  });

  if (!existing) {
    await PriceList.bulkCreate(
      DEFAULT_PRICE_LISTS.map((row) => ({
        ...row,
        company_id: companyId,
        builder_id: builderId,
        created_by: userId,
        updated_by: userId,
      })),
    );

    // Return empty payload when no filters were applied (matches original behaviour)
    if (!is_active && !is_suggested && !search && !location_id) {
      return {
        data: {
          priceList: [],
          pagination: { totalRecords: 0, currentPage: pageValue, limit: limitValue, totalPages: 0 },
        },
      };
    }
  }

  // ── Build where clause ─────────────────────────────────────────────────
  const where = { ...ownerScope(companyId, builderId) };

  // Default: only show non-suggested; overridden when filter is provided
  if (is_suggested !== undefined) {
    where.is_suggested = String(is_suggested) === "true";
  } else {
    where.is_suggested = false;
  }

  if (is_active !== undefined) {
    where.is_active = String(is_active) === "true";
  }

  if (search) {
    where.name = { [Op.iLike]: `%${search.trim()}%` };
  }

  if (location_id) {
    where.location = location_id;
  }

  // ── Paginated fetch ────────────────────────────────────────────────────
  const { count, rows } = await PriceList.findAndCountAll({
    where,
    order: [
      ["sort_order", "ASC"],
      ["name", "ASC"],
    ],
    limit: limitValue,
    offset,
  });

  return {
    data: {
      priceList: keysToCamelCase(rows.map((r) => r.get({ plain: true }))),
      pagination: {
        totalRecords: count,
        currentPage: pageValue,
        limit: limitValue,
        totalPages: Math.ceil(count / limitValue),
      },
    },
  };
}

// ─── SERVICE: DELETE PRICE LIST ───────────────────────────────────────────────

/**
 * Deletes a PriceList row by ID and re-sequences sort_order.
 *
 * @returns {{ success: true }|{ error: { status: number, message: string } }}
 */
export async function deletePriceListService({ companyId, builderId, priceListId }) {
  const { PriceList, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const record = await PriceList.findOne({
      where: { price_list_id: priceListId, ...ownerScope(companyId, builderId) },
      attributes: ["price_list_id", "sort_order"],
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return {
        error: {
          status: 404,
          message: "Record not found or you do not have permission to delete this.",
        },
      };
    }

    const deletedSortOrder = record.sort_order;

    // ── Re-sequence: shift rows after deleted position up by 1 ────────────
    await PriceList.decrement("sort_order", {
      by: 1,
      where: {
        ...ownerScope(companyId, builderId),
        sort_order: { [Op.gt]: deletedSortOrder },
      },
      transaction,
    });

    // ── Delete ─────────────────────────────────────────────────────────────
    await record.destroy({ transaction });

    await transaction.commit();

    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: UPDATE PRICE LIST ───────────────────────────────────────────────

/**
 * Partially updates a PriceList row.
 * Enforces is_active state-transition rules, unique name check,
 * sort_order re-sequencing, and location validation.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function updatePriceListService({
  companyId,
  builderId,
  userId,
  priceListId,
  name,
  sort_order,
  show_in_view_list,
  is_active,
  location,
}) {
  const { PriceList, Location, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const record = await PriceList.findOne({
      where: { price_list_id: priceListId, ...ownerScope(companyId, builderId) },
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return {
        error: {
          status: 404,
          message: "Record not found or you do not have permission to update this.",
        },
      };
    }

    const currentIsActive = record.is_active;
    const requestedIsActiveFalse = is_active === false || is_active === "false";
    const requestedIsActiveTrue = is_active === true || is_active === "true";

    const updatingOtherFields = [name, sort_order, show_in_view_list].some(
      (val) => val !== undefined,
    );

    // ── is_active state-transition guards ─────────────────────────────────
    if (currentIsActive === true && requestedIsActiveFalse && updatingOtherFields) {
      await transaction.rollback();
      return {
        error: {
          status: 403,
          message:
            "To deactivate an active price list, 'is_active' must be the only field provided in the request.",
        },
      };
    }

    if (currentIsActive === false) {
      if (requestedIsActiveFalse) {
        await transaction.rollback();
        return {
          error: {
            status: 403,
            message:
              "Price list is already inactive. 'is_active' can only be updated to true from this state.",
          },
        };
      }

      if (updatingOtherFields && !requestedIsActiveTrue) {
        await transaction.rollback();
        return {
          error: {
            status: 403,
            message:
              "Cannot update non-'is_active' fields when price list is currently inactive. Only 'is_active' can be changed (to true).",
          },
        };
      }
    }

    // ── Guard: at least one field required ─────────────────────────────────
    if (
      name === undefined &&
      sort_order === undefined &&
      show_in_view_list === undefined &&
      is_active === undefined
    ) {
      await transaction.rollback();
      return { error: { status: 400, message: "At least one field is required to update." } };
    }

    // ── Duplicate name check (exclude self) ────────────────────────────────
    if (name && name.trim() !== record.name) {
      const duplicate = await PriceList.findOne({
        where: {
          name: name.trim(),
          is_sample_data: false,
          ...ownerScope(companyId, builderId),
          price_list_id: { [Op.ne]: priceListId },
        },
        transaction,
      });

      if (duplicate) {
        await transaction.rollback();
        return { error: { status: 400, message: "Name already exists." } };
      }
    }

    // ── Sort order re-sequencing ───────────────────────────────────────────
    if (sort_order !== undefined) {
      const newSort = parseInt(sort_order, 10);

      const maxSortOrder = await PriceList.max("sort_order", {
        where: ownerScope(companyId, builderId),
        transaction,
      }) ?? 0;

      if (newSort < 1 || newSort > maxSortOrder) {
        await transaction.rollback();
        return {
          error: {
            status: 400,
            message: `Invalid sort_order. Allowed range is 1 to ${maxSortOrder}.`,
          },
        };
      }

      const oldSort = record.sort_order;

      if (newSort !== oldSort) {
        if (newSort > oldSort) {
          // Moving down: shift records between old and new position up by 1
          await PriceList.decrement("sort_order", {
            by: 1,
            where: {
              ...ownerScope(companyId, builderId),
              sort_order: { [Op.gt]: oldSort, [Op.lte]: newSort },
              price_list_id: { [Op.ne]: priceListId },
            },
            transaction,
          });
        } else {
          // Moving up: shift records between new and old position down by 1
          await PriceList.increment("sort_order", {
            by: 1,
            where: {
              ...ownerScope(companyId, builderId),
              sort_order: { [Op.gte]: newSort, [Op.lt]: oldSort },
              price_list_id: { [Op.ne]: priceListId },
            },
            transaction,
          });
        }
      }
    }

    // ── Validate location ──────────────────────────────────────────────────
    if (location) {
      const validLocation = await Location.findOne({
        where: { location_id: location, status: true },
        attributes: ["location_id"],
        transaction,
      });

      if (!validLocation) {
        await transaction.rollback();
        return {
          error: { status: 400, message: "Invalid location. Location does not exist." },
        };
      }
    }

    // ── Build update payload ───────────────────────────────────────────────
    const updatePayload = {
      ...(name !== undefined && { name: name.trim() }),
      ...(sort_order !== undefined && { sort_order: parseInt(sort_order, 10) }),
      ...(show_in_view_list !== undefined && { show_in_view_list }),
      ...(is_active !== undefined && { is_active }),
      updated_by: userId,
    };

    await record.update(updatePayload, { transaction });

    await transaction.commit();

    return { data: keysToCamelCase(record.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: TOGGLE SUGGESTED PRICE LIST ────────────────────────────────────

/**
 * Toggles is_suggested from true → false for a PriceList row.
 * Re-normalises all sort_order values for the scope (de-duplicates gaps/collisions),
 * then removes the row from its current sort position and compacts the remaining rows.
 *
 * Note: the original only allows toggling true → false, not false → true.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function toggleSuggestedPriceListService({
  companyId,
  builderId,
  priceListId,
  userId,
}) {
  const { PriceList, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const record = await PriceList.findOne({
      where: { price_list_id: priceListId, ...ownerScope(companyId, builderId) },
      attributes: ["price_list_id", "is_suggested", "sort_order"],
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return {
        error: {
          status: 404,
          message: "Price list not found or you do not have permission to modify this.",
        },
      };
    }

    if (record.is_suggested === false) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message:
            "Cannot change is_suggested from false to true. Only allowed to change from true to false.",
        },
      };
    }

    // ── Re-normalise sort_order values to eliminate gaps/collisions ────────
    // Uses a window-function UPDATE via raw SQL — Sequelize has no native
    // ROW_NUMBER() OVER(...) UPDATE support.
    await sequelize.query(
      `WITH numbered_records AS (
        SELECT
          price_list_id,
          ROW_NUMBER() OVER (ORDER BY COALESCE(sort_order, 999999), created_at) AS new_order
        FROM price_list
        WHERE company_id = :companyId AND builder_id = :builderId
      )
      UPDATE price_list p
      SET sort_order = nr.new_order, updated_at = NOW()
      FROM numbered_records nr
      WHERE p.price_list_id = nr.price_list_id
        AND p.sort_order != nr.new_order`,
      {
        replacements: { companyId, builderId },
        transaction,
      },
    );

    // Re-fetch record's sort_order after normalisation
    await record.reload({ transaction });
    const currentSortOrder = record.sort_order;

    if (currentSortOrder === null) {
      // Assign the next available sort position
      const maxSortOrder = await PriceList.max("sort_order", {
        where: ownerScope(companyId, builderId),
        transaction,
      }) ?? 0;

      await record.update({ sort_order: maxSortOrder + 1 }, { transaction });
    } else {
      // Compact: shift all other rows after this position up by 1
      await PriceList.decrement("sort_order", {
        by: 1,
        where: {
          ...ownerScope(companyId, builderId),
          price_list_id: { [Op.ne]: priceListId },
          sort_order: { [Op.gt]: currentSortOrder },
        },
        transaction,
      });
    }

    // ── Toggle is_suggested false ──────────────────────────────────────────
    await record.update({ is_suggested: false, updated_by: userId }, { transaction });

    await transaction.commit();

    return { data: keysToCamelCase(record.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
