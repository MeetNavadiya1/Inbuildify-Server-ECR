import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

const VALID_CONDITIONS = ["site_fall", "land_size", "corner_block", "land_fill"];

/**
 * Validates the condition_name + status/range_start/range_end combination.
 * Returns an error message string on failure, null if valid.
 */
function validateConditionFields({ condition_name, status, range_start, range_end }) {
  if (!VALID_CONDITIONS.includes(condition_name)) {
    return `Invalid condition_name. Must be one of: ${VALID_CONDITIONS.join(", ")}`;
  }

  if (condition_name === "corner_block") {
    if (range_start !== undefined || range_end !== undefined) {
      return "range_start and range_end are not applicable for corner_block condition";
    }
    if (status === undefined) {
      return "status is required for corner_block condition";
    }
  } else {
    if (status !== undefined) {
      return "status is not allow when the condition name is land_fill, land_size, site_fall.";
    }
    if (range_start === undefined || range_end === undefined) {
      return "range_start and range_end are required for this condition";
    }
    if (range_start >= range_end) {
      return "range_start must be less than range_end";
    }
  }

  return null;
}

/**
 * Finds a PriceListItemCondition by ID and verifies ownership via the joined PriceListItem.
 * Returns { record } on success or { error } on failure.
 */
async function findConditionWithOwnership(
  price_list_item_condition_id,
  companyId,
  builderId,
  transaction,
) {
  const { PriceListItemCondition, PriceListItem } = db;

  const condition = await PriceListItemCondition.findOne({
    where: { price_list_item_condition_id },
    include: [
      {
        model: PriceListItem,
        as: "priceListItem",
        attributes: ["price_list_item_id", "company_id", "builder_id", "item_description"],
        where: {
          [Op.or]: [
            ...(companyId ? [{ company_id: companyId }] : []),
            ...(builderId ? [{ builder_id: builderId }] : []),
          ],
        },
        required: true,
      },
    ],
    transaction,
  });

  if (!condition) {
    return { error: { status: 404, message: "Price list item condition not found or unauthorized" } };
  }

  return { record: condition };
}

// ─── SERVICE: CREATE PRICE LIST ITEM CONDITION ───────────────────────────────

/**
 * Creates a new PriceListItemCondition.
 * Validates ownership of the price_list_item, condition rules, and uniqueness.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function createPriceListItemConditionService({
  companyId,
  builderId,
  price_list_item_id,
  condition_name,
  status,
  range_start,
  range_end,
}) {
  const { PriceListItemCondition, PriceListItem, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Ownership check on price_list_item ─────────────────────────────────
    const priceListItem = await PriceListItem.findOne({
      where: {
        price_list_item_id,
        [Op.or]: [
          ...(companyId ? [{ company_id: companyId }] : []),
          ...(builderId ? [{ builder_id: builderId }] : []),
        ],
      },
      attributes: ["price_list_item_id"],
      transaction,
    });

    if (!priceListItem) {
      await transaction.rollback();
      return { error: { status: 404, message: "Price list item not found or unauthorized" } };
    }

    // ── Validate condition field rules ─────────────────────────────────────
    const validationError = validateConditionFields({ condition_name, status, range_start, range_end });
    if (validationError) {
      await transaction.rollback();
      return { error: { status: 400, message: validationError } };
    }

    // ── Uniqueness check: one row per condition_name per item ──────────────
    const duplicate = await PriceListItemCondition.findOne({
      where: { price_list_item_id, condition_name },
      attributes: ["price_list_item_condition_id"],
      transaction,
    });

    if (duplicate) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: `Condition '${condition_name}' already exists for this price list item`,
        },
      };
    }

    // ── Insert ─────────────────────────────────────────────────────────────
    const created = await PriceListItemCondition.create(
      {
        price_list_item_id,
        condition_name,
        status: condition_name === "corner_block" ? status : null,
        range_start: condition_name === "corner_block" ? null : range_start,
        range_end: condition_name === "corner_block" ? null : range_end,
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

// ─── SERVICE: GET ALL PRICE LIST ITEM CONDITIONS ─────────────────────────────

/**
 * Fetches all PriceListItemConditions for the builder/company,
 * optionally filtered by price_list_item_id.
 *
 * @returns {{ data: object[] }}
 */
export async function getAllPriceListItemConditionsService({
  companyId,
  builderId,
  price_list_item_id,
}) {
  const { PriceListItemCondition, PriceListItem } = db;

  const itemWhere = {
    [Op.or]: [
      ...(companyId ? [{ company_id: companyId }] : []),
      ...(builderId ? [{ builder_id: builderId }] : []),
    ],
  };

  if (price_list_item_id) {
    itemWhere.price_list_item_id = price_list_item_id;
  }

  const conditions = await PriceListItemCondition.findAll({
    include: [
      {
        model: PriceListItem,
        as: "priceListItem",
        attributes: ["item_description"],
        where: itemWhere,
        required: true,
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  const data = conditions.map((c) => {
    const plain = c.get({ plain: true });
    return keysToCamelCase({
      price_list_item_condition_id: plain.price_list_item_condition_id,
      price_list_item_id: plain.price_list_item_id,
      condition_name: plain.condition_name,
      status: plain.status,
      range_start: plain.range_start,
      range_end: plain.range_end,
      created_at: plain.createdAt,
      updated_at: plain.updatedAt,
      item_description: plain.priceListItem?.item_description ?? null,
    });
  });

  return { data };
}

// ─── SERVICE: GET PRICE LIST ITEM CONDITION BY ID ────────────────────────────

/**
 * Fetches a single PriceListItemCondition by ID with ownership check.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function getPriceListItemConditionByIdService({
  price_list_item_condition_id,
  companyId,
  builderId,
}) {
  const result = await findConditionWithOwnership(
    price_list_item_condition_id,
    companyId,
    builderId,
    null,
  );

  if (result.error) {
    return result;
  }

  const plain = result.record.get({ plain: true });

  return {
    data: keysToCamelCase({
      price_list_item_condition_id: plain.price_list_item_condition_id,
      price_list_item_id: plain.price_list_item_id,
      condition_name: plain.condition_name,
      status: plain.status,
      range_start: plain.range_start,
      range_end: plain.range_end,
      created_at: plain.createdAt,
      updated_at: plain.updatedAt,
      item_description: plain.priceListItem?.item_description ?? null,
    }),
  };
}

// ─── SERVICE: UPDATE PRICE LIST ITEM CONDITION ───────────────────────────────

/**
 * Updates a PriceListItemCondition.
 * Validates ownership, condition_name change rules, and field consistency.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function updatePriceListItemConditionService({
  price_list_item_condition_id,
  companyId,
  builderId,
  condition_name,
  status,
  range_start,
  range_end,
}) {
  const { PriceListItemCondition, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find & authorize ───────────────────────────────────────────────────
    const ownershipResult = await findConditionWithOwnership(
      price_list_item_condition_id,
      companyId,
      builderId,
      transaction,
    );

    if (ownershipResult.error) {
      await transaction.rollback();
      return ownershipResult;
    }

    const current = ownershipResult.record;
    const currentPlain = current.get({ plain: true });
    const finalConditionName = condition_name || currentPlain.condition_name;

    // ── Validate condition_name change ─────────────────────────────────────
    if (condition_name && condition_name !== currentPlain.condition_name) {
      if (!VALID_CONDITIONS.includes(condition_name)) {
        await transaction.rollback();
        return {
          error: {
            status: 400,
            message: `Invalid condition_name. Must be one of: ${VALID_CONDITIONS.join(", ")}`,
          },
        };
      }

      const duplicate = await PriceListItemCondition.findOne({
        where: {
          price_list_item_id: currentPlain.price_list_item_id,
          condition_name,
          price_list_item_condition_id: { [Op.ne]: price_list_item_condition_id },
        },
        attributes: ["price_list_item_condition_id"],
        transaction,
      });

      if (duplicate) {
        await transaction.rollback();
        return {
          error: {
            status: 400,
            message: `Condition '${condition_name}' already exists for this price list item`,
          },
        };
      }
    }

    // ── Guard: range fields not allowed for corner_block ───────────────────
    if (finalConditionName === "corner_block") {
      if (range_start !== undefined || range_end !== undefined) {
        await transaction.rollback();
        return {
          error: {
            status: 400,
            message: "range_start and range_end are not applicable for corner_block condition",
          },
        };
      }
    } else if (
      range_start !== undefined &&
      range_end !== undefined &&
      range_start >= range_end
    ) {
      await transaction.rollback();
      return { error: { status: 400, message: "range_start must be less than range_end" } };
    }

    // ── Build update payload ───────────────────────────────────────────────
    const updatePayload = {};

    // When condition_name changes, null out incompatible fields
    if (condition_name && condition_name !== currentPlain.condition_name) {
      if (condition_name === "corner_block") {
        updatePayload.range_start = null;
        updatePayload.range_end = null;
      } else {
        updatePayload.status = null;
        if (range_start === undefined) {
          updatePayload.range_start = null;
        }
        if (range_end === undefined) {
          updatePayload.range_end = null;
        }
      }
      updatePayload.condition_name = condition_name;
    }

    if (status !== undefined && finalConditionName === "corner_block") {
      updatePayload.status = status;
    }

    if (range_start !== undefined && finalConditionName !== "corner_block") {
      updatePayload.range_start = range_start;
    }

    if (range_end !== undefined && finalConditionName !== "corner_block") {
      updatePayload.range_end = range_end;
    }

    if (Object.keys(updatePayload).length === 0) {
      await transaction.rollback();
      return { error: { status: 400, message: "At least one field is required for update" } };
    }

    await current.update(updatePayload, { transaction });

    await transaction.commit();

    return { data: keysToCamelCase(current.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: DELETE PRICE LIST ITEM CONDITION ───────────────────────────────

/**
 * Deletes a PriceListItemCondition by ID after ownership check.
 *
 * @returns {{ success: true }|{ error: { status: number, message: string } }}
 */
export async function deletePriceListItemConditionService({
  price_list_item_condition_id,
  companyId,
  builderId,
}) {
  const { sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const ownershipResult = await findConditionWithOwnership(
      price_list_item_condition_id,
      companyId,
      builderId,
      transaction,
    );

    if (ownershipResult.error) {
      await transaction.rollback();
      return ownershipResult;
    }

    await ownershipResult.record.destroy({ transaction });

    await transaction.commit();

    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
