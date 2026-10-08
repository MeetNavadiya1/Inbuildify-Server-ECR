import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

class JobVariationItemService {
  /**
   * Ownership check: Ensures job variation belongs to the current organization.
   */
  async verifyVariationOwnership(variationId, builderId, companyId) {
    const { JobVariation } = db.sequelize?.models || db;
    const variation = await JobVariation.findOne({
      where: {
        variation_id: variationId,
        [Op.or]: [
          ...(builderId ? [{ builder_id: builderId }] : []),
          ...(companyId ? [{ company_id: companyId }] : []),
        ],
      },
    });
    return variation;
  }

  async verifyMetadataOwnership(tableName, idArray, companyId, builderId) {
    if (!idArray || !Array.isArray(idArray) || idArray.length === 0) {
      return true;
    }
    const modelName = tableName === "range" ? "Range" : "DwellingType";
    const Model = db[modelName];
    const count = await Model.count({
      where: {
        [`${tableName}_id`]: { [Op.in]: idArray },
        [Op.or]: [
          ...(companyId ? [{ company_id: companyId }] : []),
          ...(builderId ? [{ builder_id: builderId }] : []),
        ],
      },
    });
    return count === idArray.length;
  }

  _formatItemResponse(item) {
    const plain = item.get({ plain: true });
    return {
      key: plain.job_variation_item_id,
      jobVariationItemId: plain.job_variation_item_id,
      variationId: plain.variation_id,
      additional: plain.additional || "",
      siteCost: plain.site_cost || "",
      cost: plain.cost || "",
      drawingChanges: !!plain.drawing_changes,
      isPriceMaster: !!plain.is_price_master,
      quantity: parseFloat(plain.quantity) || 0,
      price: parseFloat(plain.price) || 0,
      total: parseFloat(plain.total) || 0,
      itemType: plain.item_type || null,
      description: plain.description || null,
      uom: plain.uom || null,
      note: plain.note || null,
    };
  }

  async getJobVariationItems(variationId, builderId, companyId) {
    const { JobVariationItem } = db.sequelize?.models || db;

    // 1. Verify Ownership
    const variation = await this.verifyVariationOwnership(variationId, builderId, companyId);
    if (!variation) {
      throw { status: 404, message: "Job variation not found or unauthorized" };
    }

    // 2. Fetch Items
    const items = await JobVariationItem.findAll({
      where: { variation_id: variationId },
      order: [["created_at", "ASC"]],
    });

    return {
      success: true,
      data: items.map((item) => this._formatItemResponse(item)),
      message: "Job variation items fetched successfully",
    };
  }

  async addJobVariationItem(data, builderId, companyId) {
    const { variation_id, price_list_item_id, quantity, note } = data;
    const { JobVariationItem, PriceListItem, PriceList } = db.sequelize?.models || db;
    const t = await db.sequelize.transaction();

    try {
      // 1. Verify variation ownership and status
      const variation = await this.verifyVariationOwnership(variation_id, builderId, companyId);
      if (!variation) {
        throw { status: 404, message: "Job variation not found or unauthorized" };
      }

      if (variation.status === "approved") {
        throw { status: 400, message: "Cannot modify an approved variation" };
      }

      // 2. Fetch master item details
      const masterItem = await PriceListItem.findOne({
        where: {
          price_list_item_id,
          status: "active",
          [Op.or]: [
            ...(companyId ? [{ company_id: companyId }] : []),
            ...(builderId ? [{ builder_id: builderId }] : []),
          ],
        },
        include: [
          {
            model: PriceList,
            as: "priceList",
            attributes: ["name"],
          },
        ],
        transaction: t,
      });

      if (!masterItem) {
        throw { status: 404, message: "Price list item not found or inactive" };
      }

      // 3. Check for duplicate
      const duplicateExists = await JobVariationItem.findOne({
        where: { variation_id, price_list_item_id },
        transaction: t,
      });

      if (duplicateExists) {
        throw { status: 409, message: "This item is already added to the variation" };
      }

      // 4. Calculations
      const qty = parseFloat(quantity) || 1;
      const unitCost = parseFloat(masterItem.cost || 0);
      const totalPrice = parseFloat((qty * unitCost).toFixed(2));

      // 5. Create snapshot
      const newItem = await JobVariationItem.create(
        {
          variation_id,
          price_list_id: masterItem.price_list_id,
          price_list_item_id: masterItem.price_list_item_id,
          additional: masterItem.short_description || masterItem.item_description,
          drawing_changes: false,
          quantity: qty,
          price: unitCost,
          total: totalPrice,
          item_type: "additional",
          description: masterItem.item_description,
          uom: masterItem.uom,
          note: note || null,
          range_id: masterItem.range_id || [],
          dwelling_type_id: masterItem.dwelling_type_id || [],
        },
        { transaction: t },
      );

      await t.commit();
      return {
        success: true,
        data: this._formatItemResponse(newItem),
        message: "Item added to job variation successfully",
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async updateJobVariationItem(id, updateData, builderId, companyId) {
    const { quantity, note, additional } = updateData;
    const { JobVariationItem, JobVariation } = db.sequelize?.models || db;
    const t = await db.sequelize.transaction();

    try {
      // 1. Fetch item to verify ownership and variation status
      const item = await JobVariationItem.findOne({
        where: { job_variation_item_id: id },
        include: [
          {
            model: JobVariation,
            as: "jobVariation",
            required: true,
            where: {
              [Op.or]: [
                ...(builderId ? [{ builder_id: builderId }] : []),
                ...(companyId ? [{ company_id: companyId }] : []),
              ],
            },
          },
        ],
        transaction: t,
      });

      if (!item) {
        throw { status: 404, message: "Job variation item not found or unauthorized" };
      }

      if (item.jobVariation?.status === "approved") {
        throw { status: 400, message: "Cannot modify an approved variation" };
      }

      // 2. Perform calculations
      const qty = quantity !== undefined ? parseFloat(quantity) : parseFloat(item.quantity);
      const unitCost = parseFloat(item.price || 0);
      const totalPrice = parseFloat((qty * unitCost).toFixed(2));

      // 3. Update
      await item.update(
        {
          quantity: qty,
          note: note !== undefined ? note : item.note,
          total: totalPrice,
          additional: additional !== undefined ? additional : item.additional,
        },
        { transaction: t },
      );

      await t.commit();
      return {
        success: true,
        data: this._formatItemResponse(item),
        message: "Variation item updated successfully",
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async updateExtraJobVariationItemService(id, data, builderId, companyId) {
    const { JobVariationItem } = db.sequelize?.models || db;
    const {
      additional,
      site_cost,
      cost,
      drawing_changes,
      price,
      quantity,
      note,
      description,
      uom,
      price_list_item_range_id,
      price_list_item_dwelling_type_id,
    } = data;

    const t = await db.sequelize.transaction();
    try {
      // 1. Fetch existing item
      const item = await JobVariationItem.findOne({
        where: { job_variation_item_id: id },
        include: [
          {
            model: db.JobVariation,
            as: "jobVariation",
            required: true,
            where: {
              [Op.or]: [
                ...(companyId ? [{ company_id: companyId }] : []),
                ...(builderId ? [{ builder_id: builderId }] : []),
              ],
            },
          },
        ],
        transaction: t,
      });

      if (!item) {
        throw { status: 404, message: "Job variation item not found or unauthorized" };
      }

      if (item.jobVariation?.status === "approved") {
        throw { status: 400, message: "Cannot modify an approved variation" };
      }

      // 2. Verify metadata ownership if provided
      if (price_list_item_range_id !== undefined && Array.isArray(price_list_item_range_id)) {
        const rangesValid = await this.verifyMetadataOwnership(
          "range",
          price_list_item_range_id,
          companyId,
          builderId,
        );
        if (!rangesValid) {
          throw { status: 403, message: "One or more Range IDs are invalid or unauthorized" };
        }
      }

      if (
        price_list_item_dwelling_type_id !== undefined &&
        Array.isArray(price_list_item_dwelling_type_id)
      ) {
        const dwellingTypesValid = await this.verifyMetadataOwnership(
          "dwelling_type",
          price_list_item_dwelling_type_id,
          companyId,
          builderId,
        );
        if (!dwellingTypesValid) {
          throw { status: 403, message: "One or more Dwelling Type IDs are invalid or unauthorized" };
        }
      }

      // 3. Calculations
      const extra_type = item.item_type;
      let qty = parseFloat(quantity !== undefined ? quantity : item.quantity);
      let unitCost = parseFloat(price !== undefined ? price : item.price);
      let totalPrice = parseFloat(item.total);

      if (extra_type === "additional") {
        totalPrice = parseFloat((qty * unitCost).toFixed(2));
      } else if (extra_type === "discount") {
        qty = 1;
        unitCost = -Math.abs(unitCost);
        totalPrice = unitCost;
      } else if (extra_type === "complimentary") {
        unitCost = 0;
        totalPrice = 0;
      } else if (extra_type === "notes") {
        qty = 1;
        unitCost = 0;
        totalPrice = 0;
      }

      // 4. Update
      await item.update(
        {
          additional: additional !== undefined ? additional : item.additional,
          site_cost: site_cost !== undefined ? site_cost : item.site_cost,
          cost: cost !== undefined ? cost : item.cost,
          drawing_changes: drawing_changes !== undefined ? drawing_changes : item.drawing_changes,
          price: unitCost,
          quantity: qty,
          total: totalPrice,
          note: note !== undefined ? note : item.note,
          description: description !== undefined ? description : item.description,
          notes: note !== undefined ? note : item.notes,
          uom: uom !== undefined ? uom : item.uom,
          range_id: price_list_item_range_id !== undefined ? price_list_item_range_id : item.range_id,
          dwelling_type_id:
            price_list_item_dwelling_type_id !== undefined
              ? price_list_item_dwelling_type_id
              : item.dwelling_type_id,
          updatedAt: new Date(),
        },
        { transaction: t },
      );

      await t.commit();
      return {
        success: true,
        data: this._formatItemResponse(item),
        message: "Extra job variation item updated successfully",
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async addExtraJobVariationItemService(variationId, data, builderId, companyId) {
    const { JobVariationItem, PriceList } = db.sequelize?.models || db;
    const {
      extra_type,
      price_list_id,
      price_list_item_id,
      price_list_item_range_id,
      price_list_item_dwelling_type_id,
      additional,
      site_cost,
      cost,
      drawing_changes,
      price,
      quantity,
      note,
      description,
      uom,
    } = data;

    const t = await db.sequelize.transaction();
    try {
      // 1. Verify variation ownership and status
      const variation = await this.verifyVariationOwnership(variationId, builderId, companyId);
      if (!variation) {
        throw { status: 404, message: "Job variation not found or unauthorized" };
      }

      if (variation.status === "approved") {
        throw { status: 400, message: "Cannot modify an approved variation" };
      }

      // 2. Verify metadata ownership
      const rangesValid = await this.verifyMetadataOwnership(
        "range",
        price_list_item_range_id,
        companyId,
        builderId,
      );
      if (!rangesValid) {
        throw { status: 403, message: "One or more Range IDs are invalid or unauthorized" };
      }

      const dwellingTypesValid = await this.verifyMetadataOwnership(
        "dwelling_type",
        price_list_item_dwelling_type_id,
        companyId,
        builderId,
      );
      if (!dwellingTypesValid) {
        throw { status: 403, message: "One or more Dwelling Type IDs are invalid or unauthorized" };
      }

      // 3. Fetch Price List details if provided
      if (price_list_id) {
        const priceList = await PriceList.findOne({
          where: {
            price_list_id,
            [Op.or]: [
              ...(companyId ? [{ company_id: companyId }] : []),
              ...(builderId ? [{ builder_id: builderId }] : []),
            ],
          },
          attributes: ["name"],
        });

        if (!priceList) {
          throw { status: 404, message: "Price list not found or unauthorized" };
        }
      }

      // 4. Calculations based on extra_type (additional, complimentary, discount, notes)
      let qty = parseFloat(quantity) || 1;
      let unitCost = parseFloat(price || 0);
      let totalPrice = 0;

      if (extra_type === "additional") {
        totalPrice = parseFloat((qty * unitCost).toFixed(2));
      } else if (extra_type === "discount") {
        qty = 1;
        unitCost = -Math.abs(unitCost);
        totalPrice = unitCost;
      } else if (extra_type === "complimentary") {
        unitCost = 0;
        totalPrice = 0;
      } else if (extra_type === "notes") {
        qty = 1;
        unitCost = 0;
        totalPrice = 0;
      }

      // 5. Create Item
      const newItem = await JobVariationItem.create(
        {
          variation_id: variationId,
          price_list_id,
          price_list_item_id: price_list_item_id || null,
          additional,
          site_cost: site_cost || null,
          cost: cost || null,
          drawing_changes: drawing_changes || false,
          quantity: qty,
          price: unitCost,
          total: totalPrice,
          item_type: extra_type,
          description: description || null,
          uom: uom || null,
          note: note || null,
          notes: note || null,
          range_id: price_list_item_range_id || [],
          dwelling_type_id: price_list_item_dwelling_type_id || [],
        },
        { transaction: t },
      );

      await t.commit();
      return {
        success: true,
        data: this._formatItemResponse(newItem),
        message: "Extra job variation item added successfully",
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async getJobVariationItemById(id, builderId, companyId) {
    const { JobVariationItem, JobVariation } = db.sequelize?.models || db;

    const item = await JobVariationItem.findOne({
      where: { job_variation_item_id: id },
      include: [
        {
          model: JobVariation,
          as: "jobVariation",
          where: {
            [Op.or]: [
              ...(builderId ? [{ builder_id: builderId }] : []),
              ...(companyId ? [{ company_id: companyId }] : []),
            ],
          },
        },
      ],
    });

    if (!item) {
      throw { status: 404, message: "Job variation item not found or unauthorized" };
    }

    return {
      success: true,
      data: this._formatItemResponse(item),
      message: "Job variation item fetched successfully",
    };
  }

  async deleteJobVariationItem(id, builderId, companyId) {
    const { JobVariationItem, JobVariation } = db.sequelize?.models || db;

    // 1. Fetch item
    const item = await JobVariationItem.findOne({
      where: { job_variation_item_id: id },
      include: [
        {
          model: JobVariation,
          as: "jobVariation",
          where: {
            [Op.or]: [
              ...(builderId ? [{ builder_id: builderId }] : []),
              ...(companyId ? [{ company_id: companyId }] : []),
            ],
          },
        },
      ],
    });

    if (!item) {
      throw { status: 404, message: "Job variation item not found or unauthorized" };
    }

    if (item.jobVariation?.status === "approved") {
      throw { status: 400, message: "Cannot modify an approved variation" };
    }

    // 2. Mark as removed instead of destroying
    await item.update({ is_removed: true });
    return {
      success: true,
      message: "Variation item marked as removed successfully",
    };
  }
}

export default new JobVariationItemService();
