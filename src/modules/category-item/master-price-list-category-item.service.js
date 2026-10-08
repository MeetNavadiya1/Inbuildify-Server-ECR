import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Sequelize, Op } from "sequelize";

class MasterPriceListCategoryItemService {
  /**
   * Verify category ownership
   */
  async verifyCategory(categoryId, builderId, companyId, transaction = null) {
    const { MasterPriceListCategories } = db;
    const category = await MasterPriceListCategories.findOne({
      where: {
        master_price_list_category_id: categoryId,
        [Op.or]: [
          { builder_id: builderId },
          { company_id: companyId }
        ],
        is_deleted: false
      },
      transaction
    });
    return category;
  }

  /**
   * Verify item ownership
   */
  async verifyItem(itemId, builderId, companyId, transaction = null) {
    const { MasterPriceListCategoriesItem } = db;
    const item = await MasterPriceListCategoriesItem.findOne({
      where: {
        master_price_list_categories_item_id: itemId,
        [Op.or]: [
          { builder_id: builderId },
          { company_id: companyId }
        ]
      },
      transaction
    });
    return item;
  }

  async createItem(builderId, companyId, userId, data) {
    const { MasterPriceListCategoriesItem } = db;
    const transaction = await db.sequelize.transaction();

    try {
      const { master_price_list_category_id, sku } = data;

      // 1. Check category
      const category = await this.verifyCategory(master_price_list_category_id, builderId, companyId, transaction);
      if (!category) {
        throw { status: 404, message: "Category not found or does not belong to your organization" };
      }

      // 2. Check SKU uniqueness within organization
      if (sku) {
        const existingSku = await MasterPriceListCategoriesItem.findOne({
          where: {
            sku,
            [Op.or]: [
              { builder_id: builderId },
              { company_id: companyId }
            ]
          },
          transaction
        });
        if (existingSku) {
          throw { status: 400, message: "SKU already exists in your organization" };
        }
      }

      // 3. Create item
      const item = await MasterPriceListCategoriesItem.create({
        ...data,
        builder_id: builderId,
        company_id: companyId,
        created_by: userId,
        updated_by: userId
      }, { transaction });

      await transaction.commit();
      return keysToCamelCase(item.get({ plain: true }));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async getItems(builderId, companyId, categoryId) {
    const { MasterPriceListCategoriesItem } = db;

    const category = await this.verifyCategory(categoryId, builderId, companyId);
    if (!category) {
      throw { status: 404, message: "Category not found or does not belong to your organization" };
    }

    const items = await MasterPriceListCategoriesItem.findAll({
      where: {
        master_price_list_category_id: categoryId,
        [Op.or]: [
          { builder_id: builderId },
          { company_id: companyId }
        ]
      },
      order: [["sort_order", "ASC"], ["created_at", "DESC"]]
    });

    return items.map(item => keysToCamelCase(item.get({ plain: true })));
  }

  async updateItem(builderId, companyId, userId, itemId, data) {
    const { MasterPriceListCategoriesItem } = db;
    const transaction = await db.sequelize.transaction();

    try {
      const item = await this.verifyItem(itemId, builderId, companyId, transaction);
      if (!item) {
        throw { status: 404, message: "Item not found or does not belong to your organization" };
      }

      if (data.sku && data.sku !== item.sku) {
        const existingSku = await MasterPriceListCategoriesItem.findOne({
          where: {
            sku: data.sku,
            [Op.or]: [
              { builder_id: builderId },
              { company_id: companyId }
            ],
            master_price_list_categories_item_id: { [Op.ne]: itemId }
          },
          transaction
        });
        if (existingSku) {
          throw { status: 400, message: "SKU already exists in your organization" };
        }
      }

      await item.update({
        ...data,
        updated_by: userId,
        updatedAt: new Date()
      }, { transaction });

      await transaction.commit();
      return keysToCamelCase(item.get({ plain: true }));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteItem(builderId, companyId, itemId) {
    const { MasterPriceListCategoriesItem } = db;
    const transaction = await db.sequelize.transaction();

    try {
      const item = await this.verifyItem(itemId, builderId, companyId, transaction);
      if (!item) {
        throw { status: 404, message: "Item not found or does not belong to your organization" };
      }

      await item.destroy({ transaction });
      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export default new MasterPriceListCategoryItemService();
