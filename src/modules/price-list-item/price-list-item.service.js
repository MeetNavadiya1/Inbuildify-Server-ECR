import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/**
 * Validates that all IDs in an array exist in the given model with is_active = true.
 * Returns an error message on the first failure, or null if all are valid.
 */
async function validateActiveIds(ids, Model, pkField, label, transaction) {
  if (!ids) {
    return null;
  }
  const idsArray = Array.isArray(ids) ? ids : [ids];

  for (const id of idsArray) {
    if (!id) {
      continue;
    }
    const found = await Model.findOne({
      where: { [pkField]: id, is_active: true },
      attributes: [pkField],
      transaction,
    });
    if (!found) {
      return `Invalid ${label} ID: ${id}. ${label} does not exist or is not active.`;
    }
  }
  return null;
}

/**
 * Formats a raw price list item plain object into the API response shape.
 */
export function formatItemResponse(camelItem) {
  return {
    priceListItemId: camelItem.priceListItemId,
    priceList: {
      id: camelItem.priceListId,
      name: camelItem.priceListName,
    },
    companyId: camelItem.companyId,
    builderId: camelItem.builderId,
    itemDescription: camelItem.itemDescription,
    shortDescription: camelItem.shortDescription,
    costType: camelItem.costType,
    costTypeText: camelItem.costTypeText,
    costOption: camelItem.costOption,
    cost: (camelItem.cost !== null && camelItem.cost !== undefined) ? camelItem.cost.toString() : null,
    builderCost: (camelItem.builderCost !== null && camelItem.builderCost !== undefined) ? camelItem.builderCost.toString() : null,
    sortOrder: camelItem.sortOrder,
    uom: camelItem.uom,
    status: camelItem.status,
    includeByDefault: camelItem.includeByDefault,
    allowRemoveFromQuotation: camelItem.allowRemoveFromQuotation,
    showInHlPackage: camelItem.showInHlPackage,
    showOnlyInPackage: camelItem.showOnlyInPackage,
    range: camelItem.rangeData || [],
    dwellingType: camelItem.dwellingTypeData || [],
    conditions: camelItem.conditionsData || [],
    additionalItem: camelItem.additionalItem,
    isSystemData: camelItem.isSystemData,
    createdBy: camelItem.createdBy,
    updatedBy: camelItem.updatedBy,
    createdAt: camelItem.createdAt,
    updatedAt: camelItem.updatedAt,
  };
}

/**
 * Fetches a single PriceListItem with enriched range, dwellingType and conditions data
 * using a raw SQL join query (mirrors original post-insert/post-update fetch).
 */
async function fetchEnrichedItem(priceListItemId, transaction) {
  const { sequelize } = db;

  const query = `
    SELECT 
      pli.*,
      pl.name as price_list_name,
      (
        SELECT json_agg(jsonb_build_object('id', r.range_id, 'name', r.name))
        FROM range r
        WHERE r.range_id = ANY(pli.range_id) AND r.is_active = true
      ) as range_data,
      (
        SELECT json_agg(jsonb_build_object('id', dt.dwelling_type_id, 'name', dt.name))
        FROM dwelling_type dt
        WHERE dt.dwelling_type_id = ANY(pli.dwelling_type_id) AND dt.is_active = true
      ) as dwelling_type_data,
      (
        SELECT json_agg(
          json_build_object(
            'priceListItemConditionId', plic.price_list_item_condition_id,
            'conditionName', plic.condition_name,
            'status', plic.status,
            'rangeStart', plic.range_start,
            'rangeEnd', plic.range_end
          ) ORDER BY plic.price_list_item_condition_id
        )
        FROM price_list_item_condition plic
        WHERE plic.price_list_item_id = pli.price_list_item_id
      ) as conditions_data
    FROM price_list_item pli
    LEFT JOIN price_list pl ON pli.price_list_id = pl.price_list_id
    WHERE pli.price_list_item_id = :priceListItemId
  `;

  const [rows] = await sequelize.query(query, {
    replacements: { priceListItemId },
    transaction,
  });

  return rows[0] ? keysToCamelCase(rows[0]) : null;
}

// ─── SERVICE: CREATE PRICE LIST ITEM ─────────────────────────────────────────

/**
 * Creates a new PriceListItem with optional conditions.
 * Validates range_ids, dwelling_type_ids, price list ownership/active status,
 * cost_type rules, and sort_order shifting.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function createPriceListItemService({
  builderId,
  companyId,
  userId,
  price_list_id,
  item_description,
  short_description,
  cost_type,
  cost_type_text,
  cost_option,
  cost,
  builder_cost,
  sort_order,
  uom,
  status,
  include_by_default,
  allow_remove_from_quotation,
  show_in_hl_package,
  show_only_in_package,
  range_id,
  dwelling_type_id,
  additional_item,
  conditions,
}) {
  const { PriceList, PriceListItem, PriceListItemCondition, Range, DwellingType, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Validate range_ids ─────────────────────────────────────────────────
    const rangeError = await validateActiveIds(range_id, Range, "range_id", "range", transaction);
    if (rangeError) {
      await transaction.rollback();
      return { error: { status: 400, message: rangeError } };
    }

    // ── Validate dwelling_type_ids ─────────────────────────────────────────
    const dwellingError = await validateActiveIds(
      dwelling_type_id, DwellingType, "dwelling_type_id", "dwelling type", transaction,
    );
    if (dwellingError) {
      await transaction.rollback();
      return { error: { status: 400, message: dwellingError } };
    }

    // ── Price list ownership check ─────────────────────────────────────────
    const priceListOwned = await PriceList.findOne({
      where: { price_list_id, builder_id: builderId },
      attributes: ["price_list_id"],
      transaction,
    });

    if (!priceListOwned) {
      await transaction.rollback();
      return {
        error: { status: 403, message: "You cannot add items in another builder's price list." },
      };
    }

    // ── Price list active check ────────────────────────────────────────────
    const priceListActive = await PriceList.findOne({
      where: { price_list_id, builder_id: builderId, is_active: true },
      attributes: ["price_list_id"],
      transaction,
    });

    if (!priceListActive) {
      await transaction.rollback();
      return {
        error: { status: 403, message: "You cannot add items in inactive price list." },
      };
    }

    // ── cost_type business rules ───────────────────────────────────────────
    if (cost_type === "Included") {
      if (!cost_type_text) {
        await transaction.rollback();
        return {
          error: { status: 400, message: "cost_type_text is required when cost_type = 'Included'." },
        };
      }
      // Ignore irrelevant fields instead of throwing error
      cost_option = "none";
      cost = null;
      builder_cost = null;
    } else if (cost_type === "Fixed" || cost_type === "Variable") {
      cost_type_text = null;
      if (cost_option === "tba" || cost_option === "tbc") {
        cost = null;
        builder_cost = null;
      } else {
        if (cost === undefined || cost === null || builder_cost === undefined || builder_cost === null) {
          await transaction.rollback();
          return {
            error: {
              status: 400,
              message: "cost, builder_cost are required for cost_type = 'Fixed' or 'Variable' when cost_option is 'none'.",
            },
          };
        }
      }
    }

    // ── Resolve and validate sort_order ────────────────────────────────────
    // Use item count (not MAX) so a stray/non-contiguous sort_order can't
    // distort the valid range. A new item can be placed at positions 1..count+1.
    const max = await PriceListItem.count({
      where: { company_id: companyId, builder_id: builderId, price_list_id },
      transaction,
    });

    const finalSortOrder = max + 1;

    // ── Insert item ────────────────────────────────────────────────────────
    const created = await PriceListItem.create(
      {
        price_list_id,
        company_id: companyId,
        builder_id: builderId,
        item_description,
        short_description: short_description || null,
        cost_type,
        cost_type_text: cost_type_text || null,
        cost_option: cost_option || "none",
        cost: cost || null,
        builder_cost: builder_cost || null,
        sort_order: finalSortOrder,
        uom: uom || null,
        status: status || "active",
        include_by_default: include_by_default || false,
        allow_remove_from_quotation: allow_remove_from_quotation || false,
        show_in_hl_package: show_in_hl_package || false,
        show_only_in_package: show_only_in_package || false,
        range_id: range_id || null,
        dwelling_type_id: dwelling_type_id || null,
        additional_item: additional_item || false,
        created_by: userId || null,
        updated_by: userId || null,
      },
      { transaction },
    );

    const newItemId = created.price_list_item_id;

    // ── Insert conditions ──────────────────────────────────────────────────
    if (Array.isArray(conditions) && conditions.length > 0) {
      const conditionRows = conditions.map((c) => ({
        price_list_item_id: newItemId,
        condition_name: c.condition_name,
        status: c.condition_name === "corner_block" ? c.status : null,
        range_start: c.condition_name === "corner_block" ? null : c.range_start,
        range_end: c.condition_name === "corner_block" ? null : c.range_end,
      }));

      await PriceListItemCondition.bulkCreate(conditionRows, { transaction });
    }

    await transaction.commit();

    // ── Fetch enriched response ────────────────────────────────────────────
    const enriched = await fetchEnrichedItem(newItemId, null);
    if (!enriched) {
      return { error: { status: 500, message: "Failed to fetch created item." } };
    }

    let conditionsData = enriched.conditionsData || [];
    if (conditionsData.length > 0) {
      conditionsData = conditionsData.map((c) => ({
        priceListItemConditionId: c.priceListItemConditionId,
        conditionName: c.conditionName,
        status: c.status,
        rangeStart: c.rangeStart,
        rangeEnd: c.rangeEnd,
      }));
    }

    return {
      data: {
        ...formatItemResponse(enriched),
        conditions: conditionsData,
      },
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: DELETE PRICE LIST ITEM ─────────────────────────────────────────

/**
 * Deletes a PriceListItem by ID after ownership check.
 * Re-sequences sort_order for remaining items in the same price list.
 *
 * @returns {{ success: true }|{ error: { status: number, message: string } }}
 */
export async function deletePriceListItemService({
  builderId,
  companyId,
  priceListItemId,
}) {
  const { PriceListItem, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find item ──────────────────────────────────────────────────────────
    const item = await PriceListItem.findOne({
      where: { price_list_item_id: priceListItemId },
      attributes: ["price_list_item_id", "builder_id", "price_list_id", "sort_order"],
      transaction,
    });

    if (!item) {
      await transaction.rollback();
      return { error: { status: 404, message: "Price list item not found." } };
    }

    if (item.builder_id !== builderId) {
      await transaction.rollback();
      return {
        error: { status: 403, message: "Permission denied. You can delete only your own record." },
      };
    }

    const deletedSortOrder = item.sort_order;
    const priceListId = item.price_list_id;

    // ── Delete ─────────────────────────────────────────────────────────────
    await item.destroy({ transaction });

    // ── Re-sequence sort_order ─────────────────────────────────────────────
    await PriceListItem.decrement("sort_order", {
      by: 1,
      where: {
        company_id: companyId,
        builder_id: builderId,
        price_list_id: priceListId,
        sort_order: { [Op.gt]: deletedSortOrder },
      },
      transaction,
    });

    await transaction.commit();

    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: UPDATE PRICE LIST ITEM ─────────────────────────────────────────

/**
 * Partially updates a PriceListItem.
 * Enforces status state-transition rules, cost_type consistency,
 * range/dwelling validation, and sort_order re-sequencing.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function updatePriceListItemService({
  builderId,
  companyId,
  userId,
  price_list_item_id,
  requestBody,
  item_description,
  short_description,
  cost_type,
  cost_type_text,
  cost_option,
  cost,
  builder_cost,
  sort_order,
  uom,
  status,
  include_by_default,
  allow_remove_from_quotation,
  show_in_hl_package,
  show_only_in_package,
  range_id,
  dwelling_type_id,
  conditions,
}) {
  const { PriceListItem, PriceListItemCondition, Range, DwellingType, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Validate range_ids ─────────────────────────────────────────────────
    const rangeError = await validateActiveIds(range_id, Range, "range_id", "range", transaction);
    if (rangeError) {
      await transaction.rollback();
      return { error: { status: 400, message: rangeError } };
    }

    // ── Validate dwelling_type_ids ─────────────────────────────────────────
    const dwellingError = await validateActiveIds(
      dwelling_type_id, DwellingType, "dwelling_type_id", "dwelling type", transaction,
    );
    if (dwellingError) {
      await transaction.rollback();
      return { error: { status: 400, message: dwellingError } };
    }

    // ── Find & authorize ───────────────────────────────────────────────────
    const old = await PriceListItem.findOne({
      where: { price_list_item_id, builder_id: builderId, company_id: companyId },
      transaction,
    });

    if (!old) {
      // Intercept and check if this is an extra item in quotation_version_items
      const { QuotationVersionItem, QuotationVersion, Quotation, Leads } = db.sequelize?.models || db;
      const extraItemExists = await QuotationVersionItem.findOne({
        where: { quotation_version_item_id: price_list_item_id, extra_item: true },
        include: [{
          model: QuotationVersion,
          as: "quotationVersion",
          include: [{
            model: Quotation,
            as: "quotation",
            include: [{
              model: Leads,
              as: "lead",
              where: {
                [Op.or]: [
                  ...(companyId ? [{ company_id: companyId }] : []),
                  ...(builderId ? [{ builder_id: builderId }] : []),
                ],
              },
            }],
          }],
        }],
        transaction,
      });

      if (extraItemExists) {
        await transaction.rollback();
        const mappedData = {};
        if (item_description !== undefined) mappedData.price_list_item_description = item_description;
        if (cost_type !== undefined) mappedData.price_list_item_cost_type = cost_type;
        if (cost_type_text !== undefined) mappedData.price_list_item_cost_type_text = cost_type_text;
        if (cost !== undefined) mappedData.price_list_item_cost = cost;
        if (builder_cost !== undefined) mappedData.price_list_item_builder_cost = builder_cost;
        if (uom !== undefined) mappedData.price_list_item_uom = uom;
        if (range_id !== undefined) mappedData.price_list_item_range_id = range_id;
        if (dwelling_type_id !== undefined) mappedData.price_list_item_dwelling_type_id = dwelling_type_id;

        const { default: quotationVersionItemService } = await import("../quotation-version-item/quotation-version-item.service.js");
        const updateResult = await quotationVersionItemService.updateExtraQuotationItemService(
          price_list_item_id,
          mappedData,
          builderId,
          companyId
        );

        if (updateResult.success) {
          const extraItemData = updateResult.data;
          const formatted = {
            priceListItemId: extraItemData.quotationVersionItemId,
            priceListId: extraItemData.priceListId,
            priceList: {
              id: extraItemData.priceListId,
              name: extraItemData.priceListName
            },
            itemDescription: extraItemData.priceListItemDescription,
            costType: extraItemData.priceListItemCostType,
            costTypeText: extraItemData.priceListItemCostTypeText,
            cost: extraItemData.priceListItemCost !== null && extraItemData.priceListItemCost !== undefined ? extraItemData.priceListItemCost.toString() : null,
            builderCost: extraItemData.priceListItemBuilderCost !== null && extraItemData.priceListItemBuilderCost !== undefined ? extraItemData.priceListItemBuilderCost.toString() : null,
            uom: extraItemData.priceListItemUom,
            extraItem: extraItemData.extraItem,
            extraType: extraItemData.extraType,
            quotationVersionItemId: extraItemData.quotationVersionItemId,
            quantity: extraItemData.quantity,
            note: extraItemData.note,
            totalPrice: extraItemData.totalPrice,
          };
          return { data: formatted };
        } else {
          return { error: { status: 400, message: updateResult.message || "Failed to update extra item." } };
        }
      }

      await transaction.rollback();
      return { error: { status: 404, message: "Item not found or unauthorized." } };
    }

    const currentStatus = old.status;
    const statusInBody = requestBody.status !== undefined;

    let requestedStatus;
    if (statusInBody) {
      const inputStatus = String(requestBody.status).trim().toLowerCase();
      if (inputStatus === "active") {
        requestedStatus = "active";
      } else if (inputStatus === "inactive") {
        requestedStatus = "inactive";
      } else {
        await transaction.rollback();
        return {
          error: { status: 400, message: "Invalid value for status. Must be 'Active' or 'Inactive'." },
        };
      }
    }

    const requestedStatusActive = requestedStatus === "active";
    const requestedStatusInactive = requestedStatus === "inactive";

    // ── Guard: price_list_id is immutable ──────────────────────────────────
    if (requestBody.price_list_id) {
      await transaction.rollback();
      return { error: { status: 400, message: "You cannot update price_list_id." } };
    }

    // ── cost_type resolution ───────────────────────────────────────────────
    let finalCostTypeText, finalCostOption, finalCost, finalBuilderCost;
    const finalCostType = cost_type ?? old.cost_type;

    if (finalCostType === "Included") {
      const updatedCostTypeText = cost_type_text !== undefined ? cost_type_text : old.cost_type_text;
      if (!updatedCostTypeText) {
        await transaction.rollback();
        return { error: { status: 400, message: "cost_type_text is required." } };
      }
      finalCostTypeText = updatedCostTypeText;
      finalCostOption = "none";
      finalCost = null;
      finalBuilderCost = null;
    } else if (finalCostType === "Fixed" || finalCostType === "Variable") {
      finalCostTypeText = null;
      finalCostOption = cost_option ?? old.cost_option;

      if (finalCostOption === "tba" || finalCostOption === "tbc") {
        finalCost = null;
        finalBuilderCost = null;
      } else {
        finalCost = cost ?? old.cost;
        finalBuilderCost = builder_cost ?? old.builder_cost;

        if (finalCostOption === null || finalCost === null || finalBuilderCost === null) {
          await transaction.rollback();
          return {
            error: { status: 400, message: "cost_option, cost and builder_cost are required when cost_option is 'none'." },
          };
        }
      }
    } else {
      finalCostTypeText = old.cost_type_text;
      finalCostOption = old.cost_option;
      finalCost = old.cost;
      finalBuilderCost = old.builder_cost;
    }

    // ── Sort order re-sequencing ───────────────────────────────────────────
    const oldSortOrder = old.sort_order;
    let finalSortOrder = oldSortOrder;

    if (sort_order !== undefined && sort_order !== null) {
      // Use item count (not MAX) so a stray/non-contiguous sort_order can't
      // shrink the valid range. The item being updated already exists, so the
      // valid target positions are 1..count.
      const itemCount = await PriceListItem.count({
        where: { company_id: companyId, builder_id: builderId, price_list_id: old.price_list_id },
        transaction,
      });

      const max = itemCount;
      const requestedSortOrder = parseInt(sort_order, 10);

      if (isNaN(requestedSortOrder) || requestedSortOrder < 1 || requestedSortOrder > max) {
        await transaction.rollback();
        return {
          error: {
            status: 400,
            message: `Invalid sort_order. Allowed range is 1 to ${max}.`,
          },
        };
      }

      finalSortOrder = requestedSortOrder;

      if (finalSortOrder !== oldSortOrder) {
        if (finalSortOrder > oldSortOrder) {
          // Moving down — shift records between old and new position up
          await PriceListItem.increment("sort_order", {
            by: -1,
            where: {
              price_list_id: old.price_list_id,
              builder_id: builderId,
              sort_order: {
                [Op.gt]: oldSortOrder,
                [Op.lte]: finalSortOrder,
              },
              price_list_item_id: { [Op.ne]: price_list_item_id },
            },
            transaction,
          });
        } else {
          // Moving up — shift records between new and old position down
          await PriceListItem.increment("sort_order", {
            by: 1,
            where: {
              price_list_id: old.price_list_id,
              builder_id: builderId,
              sort_order: {
                [Op.gte]: finalSortOrder,
                [Op.lt]: oldSortOrder,
              },
              price_list_item_id: { [Op.ne]: price_list_item_id },
            },
            transaction,
          });
        }
      }
    }

    // ── Build update payload ───────────────────────────────────────────────
    const updatePayload = {};

    if (item_description) {
      updatePayload.item_description = item_description;
    }
    if (short_description !== undefined) {
      updatePayload.short_description = short_description;
    }
    if (cost_type) {
      updatePayload.cost_type = finalCostType;
    }

    updatePayload.cost_type_text = finalCostTypeText;
    updatePayload.cost_option = finalCostOption;
    updatePayload.cost = finalCost;
    updatePayload.builder_cost = finalBuilderCost;
    updatePayload.sort_order = finalSortOrder;

    if (uom !== undefined) {
      updatePayload.uom = uom;
    }
    if (requestedStatus) {
      updatePayload.status = requestedStatus;
    }
    if (include_by_default !== undefined) {
      updatePayload.include_by_default = include_by_default;
    }
    if (allow_remove_from_quotation !== undefined) {
      updatePayload.allow_remove_from_quotation = allow_remove_from_quotation;
    }
    if (show_in_hl_package !== undefined) {
      updatePayload.show_in_hl_package = show_in_hl_package;
    }
    if (show_only_in_package !== undefined) {
      updatePayload.show_only_in_package = show_only_in_package;
    }
    if (range_id !== undefined) {
      updatePayload.range_id = range_id;
    }
    if (dwelling_type_id !== undefined) {
      updatePayload.dwelling_type_id = dwelling_type_id;
    }

    updatePayload.updated_by = userId;

    if (Object.keys(updatePayload).length === 1) {
      // Only updated_by was set — no real fields to update
      await transaction.rollback();
      return { error: { status: 400, message: "At least one field is required to update." } };
    }

    await old.update(updatePayload, { transaction });

    // ── Conditions replace (delete-then-reinsert) ──────────────────────────
    if (conditions !== undefined) {
      await PriceListItemCondition.destroy({
        where: { price_list_item_id },
        transaction,
      });

      if (Array.isArray(conditions) && conditions.length > 0) {
        const conditionRows = conditions.map((c) => ({
          price_list_item_id,
          condition_name: c.condition_name,
          status: c.condition_name === "corner_block" ? c.status : null,
          range_start: c.condition_name === "corner_block" ? null : c.range_start,
          range_end: c.condition_name === "corner_block" ? null : c.range_end,
        }));

        await PriceListItemCondition.bulkCreate(conditionRows, { transaction });
      }
    }

    await transaction.commit();

    // ── Fetch enriched response ────────────────────────────────────────────
    const enriched = await fetchEnrichedItem(price_list_item_id, null);
    if (!enriched) {
      return { error: { status: 500, message: "Failed to fetch updated item." } };
    }

    return { data: formatItemResponse(enriched) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
export async function getAllPriceListItemsService({
  builder_id,
  company_id,
  page = 1,
  limit = 25,
  status,
  cost_option,
  cost_type,
  uom,
  price,
  item_description,
  price_list_id,
  dwelling_type_id,
  range_id,
  location_id,
  sort_order,
  search,
  package_id,
  is_system_data,
  extra_item,
}) {
  const pageValue = parseInt(page, 10) > 0 ? parseInt(page, 10) : 1;
  const limitValue = parseInt(limit, 10) > 0 ? parseInt(limit, 10) : 25;
  const offset = (pageValue - 1) * limitValue;

  const { Op } = db.Sequelize;

  // 1. Build filters that must ALWAYS apply (Price List, Search, Status, etc.)
  const mandatoryFilters = [
    { "$PriceListItem.status$": status || "active" }
  ];
  if (cost_option) mandatoryFilters.push({ "$PriceListItem.cost_option$": cost_option });
  if (cost_type) mandatoryFilters.push({ "$PriceListItem.cost_type$": cost_type });
  if (uom) mandatoryFilters.push({ "$PriceListItem.uom$": uom });
  if (price) mandatoryFilters.push({ "$PriceListItem.cost$": price });
  if (item_description) mandatoryFilters.push({ "$PriceListItem.item_description$": { [Op.iLike]: `%${item_description}%` } });
  if (price_list_id) mandatoryFilters.push({ "$PriceListItem.price_list_id$": price_list_id });
  if (sort_order !== undefined && sort_order !== "") mandatoryFilters.push({ "$PriceListItem.sort_order$": parseInt(sort_order, 10) });

  if (extra_item !== undefined && extra_item !== "") {
    const isExtra = extra_item === "true" || extra_item === true;
    mandatoryFilters.push({ "$PriceListItem.additional_item$": isExtra });
  }

  if (search && search.trim() !== "") {
    const searchVal = `%${search.trim().toLowerCase()}%`;
    const pliSearchConditions = [];

    // Search in PriceListItem fields
    pliSearchConditions.push(db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("PriceListItem.item_description")), { [Op.like]: searchVal }));
    pliSearchConditions.push(db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("PriceListItem.short_description")), { [Op.like]: searchVal }));
    pliSearchConditions.push(db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("PriceListItem.cost_type")), { [Op.like]: searchVal }));
    pliSearchConditions.push(db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("PriceListItem.cost_option")), { [Op.like]: searchVal }));

    // Search for matching Range IDs
    const matchingRanges = await db.Range.findAll({
      where: { name: { [Op.iLike]: searchVal } },
      attributes: ["range_id"],
      raw: true,
    });
    const foundRangeIds = matchingRanges.map((r) => r.range_id);
    if (foundRangeIds.length > 0) {
      pliSearchConditions.push(db.sequelize.literal(`"PriceListItem"."range_id" && ARRAY['${foundRangeIds.join("','")}']::uuid[]`));
    }

    // Search for matching DwellingType IDs
    const matchingDwellingTypes = await db.DwellingType.findAll({
      where: { name: { [Op.iLike]: searchVal } },
      attributes: ["dwelling_type_id"],
      raw: true,
    });
    const foundDtIds = matchingDwellingTypes.map((dt) => dt.dwelling_type_id);
    if (foundDtIds.length > 0) {
      pliSearchConditions.push(db.sequelize.literal(`"PriceListItem"."dwelling_type_id" && ARRAY['${foundDtIds.join("','")}']::uuid[]`));
    }

    mandatoryFilters.push({ [Op.or]: pliSearchConditions });
  }

  if (package_id) {
    mandatoryFilters.push({
      "$PriceListItem.price_list_item_id$": {
        [Op.notIn]: db.sequelize.literal(`(
          SELECT price_list_item_id 
          FROM package_pricelist_item_map 
          WHERE package_id = '${package_id}'
          AND price_list_item_id NOT IN (SELECT price_list_item_id FROM floor_plan_pricelist_item_map)
        )`),
      },
    });
  }

  // 2. Build the final where clause
  const finalAndConditions = [
    { "$PriceListItem.builder_id$": builder_id },
    { "$PriceListItem.company_id$": company_id },
  ];

  // Mandatory filters always apply to everything
  if (mandatoryFilters.length > 0) {
    finalAndConditions.push({ [Op.and]: mandatoryFilters });
  }

  // ─── Range & Dwelling Type Filters ───────────────────────────────────────────
  const rangeDtConditions = [];
  const isGlobalDwelling = '("PriceListItem"."dwelling_type_id" IS NULL OR array_length("PriceListItem"."dwelling_type_id", 1) IS NULL)';
  const isGlobalRange = '("PriceListItem"."range_id" IS NULL OR array_length("PriceListItem"."range_id", 1) IS NULL)';

  if (dwelling_type_id) {
    const dtIds = Array.isArray(dwelling_type_id) ? dwelling_type_id : [dwelling_type_id];
    rangeDtConditions.push({
      [Op.or]: [
        db.sequelize.literal(`"PriceListItem"."dwelling_type_id" @> ARRAY['${dtIds.join("','")}']::uuid[]`),
        db.sequelize.literal(isGlobalDwelling),
      ],
    });
  }

  if (range_id) {
    const rIds = Array.isArray(range_id) ? range_id : [range_id];
    rangeDtConditions.push({
      [Op.or]: [
        db.sequelize.literal(`"PriceListItem"."range_id" @> ARRAY['${rIds.join("','")}']::uuid[]`),
        db.sequelize.literal(isGlobalRange),
      ],
    });
  }

  const isSystemRequested = is_system_data === "true" || is_system_data === true;

  if (isSystemRequested) {
    // Requirement: If system data requested, show items matching filters OR are marked as system items
    // NOTE: They still must match mandatoryFilters (like price_list_id)
    if (rangeDtConditions.length > 0) {
      finalAndConditions.push({
        [Op.or]: [
          { [Op.and]: rangeDtConditions },
          { "$PriceListItem.is_system_data$": true },
        ],
      });
    }
    // Also ensure we only show system items if that was the primary goal?
    // Actually, based on "always show", we include them.
  } else {
    // Normal logic
    if (rangeDtConditions.length > 0) {
      finalAndConditions.push({ [Op.and]: rangeDtConditions });
    }
    if (is_system_data !== undefined) {
      finalAndConditions.push({ "$PriceListItem.is_system_data$": false });
    }
  }



  const where = { [Op.and]: finalAndConditions };

  const priceListInclude = {
    model: db.PriceList,
    as: "priceList",
    attributes: ["name", "location"],
    required: false,
  };

  if (location_id) {
    priceListInclude.where = { location: location_id };
    priceListInclude.required = true;
  }

  if (sort_order !== undefined && sort_order !== "") {
    where["$PriceListItem.sort_order$"] = parseInt(sort_order, 10);
  }

  const findPage = (pageOffset) => db.PriceListItem.findAndCountAll({
    where,
    include: [priceListInclude],
    order: [[db.sequelize.col("PriceListItem.sort_order"), "ASC"]],
    limit: limitValue,
    offset: pageOffset,
    distinct: true,
  });

  let { count, rows } = await findPage(offset);

  // The requested page can be past the end of the result set — a filter change
  // or a deletion shrinks the list while the client still holds the old page
  // number. Serve the last real page instead of an empty list, and report that
  // page back so currentPage can never exceed totalPages.
  const totalPages = count > 0 ? Math.ceil(count / limitValue) : 0;
  let currentPage = pageValue;

  if (count > 0 && pageValue > totalPages) {
    currentPage = totalPages;
    ({ rows } = await findPage((currentPage - 1) * limitValue));
  } else if (count === 0) {
    currentPage = 1;
  }

  // Optimize Performance: Collect all range & dwelling_type IDs for a single bulk fetch
  const allRangeIds = [...new Set(rows.flatMap((item) => item.range_id || []))];
  const allDtIds = [...new Set(rows.flatMap((item) => item.dwelling_type_id || []))];

  const [rangesFetch, dwellingTypesFetch] = await Promise.all([
    allRangeIds.length ? db.Range.findAll({ where: { range_id: { [Op.in]: allRangeIds }, is_active: true }, attributes: [["range_id", "id"], "name"], raw: true }) : [],
    allDtIds.length ? db.DwellingType.findAll({ where: { dwelling_type_id: { [Op.in]: allDtIds }, is_active: true }, attributes: [["dwelling_type_id", "id"], "name"], raw: true }) : [],
  ]);

  const rangeMap = rangesFetch.reduce((acc, current) => {
    acc[current.id] = current;
    return acc;
  }, {});

  const dtMap = dwellingTypesFetch.reduce((acc, current) => {
    acc[current.id] = current;
    return acc;
  }, {});

  // Maintain the exact original response format
  const priceListItems = rows.map((item) => {
    const plain = item.get({ plain: true });

    const currentRangeData = (plain.range_id || []).map((id) => rangeMap[id]).filter(Boolean);
    const currentDwellingTypeData = (plain.dwelling_type_id || []).map((id) => dtMap[id]).filter(Boolean);

    return {
      ...plain,
      price_list_name: plain.priceList?.name || null,
      range_data: currentRangeData,
      dwelling_type_data: currentDwellingTypeData,
    };
  });

  return {
    priceListItems,
    pagination: {
      totalRecords: count,
      currentPage,
      limit: limitValue,
      totalPages,
    },
  };
}

/**
 * Copies a PriceListItem and its conditions to a target price list with a new sort order.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function copyPriceListItemService({
  priceListItemId,
  price_list_id,
  item_description,
  sort_order,
  userId,
  builderId,
  companyId,
}) {
  const { PriceListItem, PriceListItemCondition, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    let targetSortOrder = sort_order;
    if (targetSortOrder === undefined || targetSortOrder === null) {
      const maxItem = await PriceListItem.findOne({
        where: { price_list_id },
        attributes: [[sequelize.fn("MAX", sequelize.col("sort_order")), "maxSortOrder"]],
        transaction,
        raw: true,
      });
      const maxVal = maxItem ? Number(maxItem.maxSortOrder) : 0;
      targetSortOrder = isNaN(maxVal) ? 0 : maxVal + 1;
    } else {
      // 1. Shift sort order in the target price list
      await PriceListItem.increment("sort_order", {
        by: 1,
        where: {
          price_list_id,
          sort_order: { [Op.gte]: targetSortOrder },
        },
        transaction,
      });
    }

    // 2. Fetch source item
    const sourceItem = await PriceListItem.findByPk(priceListItemId, { transaction });

    if (!sourceItem) {
      await transaction.rollback();
      return { error: { status: 404, message: "Source price list item not found." } };
    }

    // 3. Insert new item (duplicate)
    const newItem = await PriceListItem.create(
      {
        price_list_id,
        company_id: companyId,
        builder_id: builderId,
        item_description,
        short_description: sourceItem.short_description,
        cost_type: sourceItem.cost_type,
        cost_type_text: sourceItem.cost_type_text,
        cost_option: sourceItem.cost_option,
        cost: sourceItem.cost,
        builder_cost: sourceItem.builder_cost,
        sort_order: targetSortOrder,
        uom: sourceItem.uom,
        status: sourceItem.status,
        include_by_default: sourceItem.include_by_default,
        allow_remove_from_quotation: sourceItem.allow_remove_from_quotation,
        show_in_hl_package: sourceItem.show_in_hl_package,
        show_only_in_package: sourceItem.show_only_in_package,
        range_id: sourceItem.range_id,
        dwelling_type_id: sourceItem.dwelling_type_id,
        additional_item: sourceItem.additional_item,
        is_system_data: sourceItem.is_system_data,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    // 4. Copy conditions
    const conditions = await PriceListItemCondition.findAll({
      where: { price_list_item_id: priceListItemId },
      transaction,
    });

    if (conditions.length > 0) {
      const conditionRows = conditions.map((c) => ({
        price_list_item_id: newItem.price_list_item_id,
        condition_name: c.condition_name,
        status: c.status,
        range_start: c.range_start,
        range_end: c.range_end,
      }));

      await PriceListItemCondition.bulkCreate(conditionRows, { transaction });
    }

    await transaction.commit();

    // Fetch the new item as plain object to ensure all fields (like defaults) are present
    const finalItem = await PriceListItem.findByPk(newItem.price_list_item_id);

    return { data: keysToCamelCase(finalItem.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
