import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

class MasterPriceListCategoryService {
  async getAllMasterPriceListCategories(userData, query) {
    const { MasterPriceListCategories } = db;
    const { builder_id: builderId } = userData;
    const { page = 1, limit = 25 } = query;

    const limitValue = parseInt(limit, 10);
    const pageValue = parseInt(page, 10);
    const offset = (pageValue - 1) * limitValue;

    const { count, rows } = await MasterPriceListCategories.findAndCountAll({
      where: {
        builder_id: builderId,
        is_deleted: false,
      },
      order: [["created_at", "DESC"]],
      limit: limitValue,
      offset,
    });

    const totalPages = Math.ceil(count / limitValue);

    return {
      rows: rows.map((r) => r.get({ plain: true })),
      pagination: {
        currentPage: pageValue,
        totalPages,
        totalRecords: count,
        limit: limitValue,
      },
    };
  }

  async getMasterPriceListCategoryById(id, builderId) {
    const { MasterPriceListCategories } = db;
    const category = await MasterPriceListCategories.findOne({
      where: {
        master_price_list_category_id: id,
        builder_id: builderId,
        is_deleted: false,
      },
    });

    if (!category) {
      throw { status: 404, message: "Category not found." };
    }

    return category.get({ plain: true });
  }

  async createMasterPriceListCategory(userData, body) {
    const { MasterPriceListCategories } = db;
    const { builder_id: builderId, company_id: companyId, users_id: createdBy } = userData;
    const { name, description } = body;

    if (!builderId || !companyId) {
      throw { status: 400, message: "Builder ID and Company ID are required." };
    }

    if (!name || name.trim() === "") {
      throw { status: 400, message: "Category name is required." };
    }

    const nextOrder = (await MasterPriceListCategories.max("display_order", {
      where: { builder_id: builderId, company_id: companyId },
    })) || 0;

    const category = await MasterPriceListCategories.create({
      company_id: companyId,
      builder_id: builderId,
      name: name.trim(),
      description: description || null,
      display_order: nextOrder + 1,
      created_by: createdBy || null,
      updated_by: createdBy || null,
    });

    return category.get({ plain: true });
  }

  async updateMasterPriceListCategory(id, userData, body) {
    const { MasterPriceListCategories } = db;
    const { builder_id: builderId, company_id: companyId, users_id: updatedBy } = userData;
    const { name, description } = body;

    if (!id) {
      throw { status: 400, message: "Category ID is required." };
    }

    const category = await MasterPriceListCategories.findOne({
      where: {
        master_price_list_category_id: id,
        builder_id: builderId,
        company_id: companyId,
        is_deleted: false,
      },
    });

    if (!category) {
      throw { status: 404, message: "Category not found or already deleted." };
    }

    await category.update({
      name: name ? name.trim() : category.name,
      description: description !== undefined ? description : category.description,
      updated_by: updatedBy || null,
      updatedAt: new Date(),
    });

    return category.get({ plain: true });
  }

  async displayOrderManage(userData, body) {
    const { MasterPriceListCategories } = db;
    const { builder_id: builderId, company_id: companyId, users_id: updatedBy } = userData;
    const { orderedCategories } = body;

    if (!Array.isArray(orderedCategories) || orderedCategories.length === 0) {
      throw { status: 400, message: "orderedCategories must be a non-empty array." };
    }

    const categoryIds = orderedCategories.map((c) => c.categoryId);

    const transaction = await db.sequelize.transaction();
    try {
      const existingCategories = await MasterPriceListCategories.findAll({
        where: {
          builder_id: builderId,
          company_id: companyId,
          is_deleted: false,
          master_price_list_category_id: { [Op.in]: categoryIds },
        },
        transaction,
      });

      const validIds = existingCategories.map((c) => c.master_price_list_category_id);
      const invalidIds = categoryIds.filter((id) => !validIds.includes(id));

      if (invalidIds.length > 0) {
        throw { status: 400, message: `Invalid or deleted category IDs: ${invalidIds.join(", ")}` };
      }

      for (const { categoryId, displayOrder } of orderedCategories) {
        await MasterPriceListCategories.update(
          { display_order: Number(displayOrder), updated_by: updatedBy || null, updatedAt: new Date() },
          {
            where: { master_price_list_category_id: categoryId, builder_id: builderId, company_id: companyId },
            transaction,
          }
        );
      }

      await transaction.commit();

      const updatedRows = await MasterPriceListCategories.findAll({
        where: { master_price_list_category_id: { [Op.in]: categoryIds } },
        order: [["display_order", "ASC"]],
      });

      return updatedRows.map((r) => r.get({ plain: true }));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteMasterPriceListCategory(id, builderId) {
    const { MasterPriceListCategories } = db;
    const category = await MasterPriceListCategories.findOne({
      where: {
        master_price_list_category_id: id,
        builder_id: builderId,
        is_deleted: false,
      },
    });

    if (!category) {
      throw { status: 404, message: "Category not found or already deleted." };
    }

    await category.update({ is_deleted: true });

    return category.get({ plain: true });
  }
}

export default new MasterPriceListCategoryService();
