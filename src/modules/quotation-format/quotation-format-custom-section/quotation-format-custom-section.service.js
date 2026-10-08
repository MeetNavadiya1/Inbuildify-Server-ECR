import { Op } from "sequelize";
import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";

// ============================================================
//        CUSTOM SECTION CRUD OPERATIONS
// ============================================================

async function createCustomSection(currentUser, quotation_format_id, payload) {
  const { QuotationFormatCustomSection, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const {
      field_name,
      field_label,
      is_applicable,
      group_field,
      sort_order,
      parent_field,
    } = payload;

    const currentUserId = currentUser.users_id;
    const companyId = currentUser.company_id;
    const builderId = currentUser.builder_id;

    const duplicateCheck = await QuotationFormatCustomSection.findOne({
      where: {
        field_name,
        quotation_format_id,
        [Op.or]: [
          { company_id: companyId, company_id: { [Op.ne]: null } },
          { builder_id: builderId, builder_id: { [Op.ne]: null } },
        ],
      },
      transaction,
    });

    if (duplicateCheck) {
      throw {
        status: 409,
        message: "Custom section field name already exists in this format",
      };
    }

    // Sort order logic
    let finalSortOrder = sort_order;
    const maxSortResult = await QuotationFormatCustomSection.max("sort_order", {
      where: { quotation_format_id },
      transaction,
    });
    const maxSortOrder = maxSortResult || 0;

    if (finalSortOrder === undefined || finalSortOrder === null) {
      finalSortOrder = maxSortOrder + 1;
    } else {
      const maxAllowed = maxSortOrder + 1;
      if (finalSortOrder > maxAllowed) {
        throw {
          status: 400,
          message: `Sort order cannot exceed ${maxAllowed}`,
        };
      }

      await QuotationFormatCustomSection.increment("sort_order", {
        by: 1,
        where: {
          quotation_format_id,
          sort_order: { [Op.gte]: finalSortOrder },
        },
        transaction,
      });
    }

    const newCustomSection = await QuotationFormatCustomSection.create(
      {
        company_id: companyId,
        builder_id: builderId,
        quotation_format_id,
        field_name,
        field_label,
        is_applicable: is_applicable !== undefined ? is_applicable : false,
        group_field: group_field !== undefined ? group_field : false,
        sort_order: finalSortOrder,
        parent_field,
        created_by: currentUserId,
        updated_by: currentUserId,
      },
      { transaction }
    );

    await transaction.commit();
    return keysToCamelCase(newCustomSection.get({ plain: true }));
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

async function getCustomSections(currentUser, filters = {}) {
  const { QuotationFormatCustomSection, Users, Company, Builder } = db;
  const userCompanyId = currentUser.company_id;
  const userBuilderId = currentUser.builder_id;
  const { page = 1, limit = 25, search, quotation_format_id } = filters;
  const offset = (page - 1) * limit;

  const where = {
    [Op.or]: [
      { company_id: userCompanyId, company_id: { [Op.ne]: null } },
      { builder_id: userBuilderId, builder_id: { [Op.ne]: null } },
    ],
  };

  if (quotation_format_id) {
    where.quotation_format_id = quotation_format_id;
  }

  if (search) {
    where[Op.or] = [
      { field_name: { [Op.iLike]: `%${search}%` } },
      { field_label: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await QuotationFormatCustomSection.findAndCountAll({
    where,
    // include: [
    //   { model: Users, as: "createdByUser", attributes: ["name"] },
    //   { model: Users, as: "updatedByUser", attributes: ["name"] },
    //   { model: Company, as: "company", attributes: ["name"] },
    //   { model: Builder, as: "builder", attributes: ["name"] },
    // ],
    order: [["sort_order", "ASC"], ["created_at", "DESC"]],
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  const customSections = rows.map((row) => {
    const plain = row.get({ plain: true });
    return {
      ...plain,
    };
  });

  return {
    customSections: keysToCamelCase(customSections),
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / limit),
      totalRecords: count,
      limit: parseInt(limit),
    },
  };
}

async function getCustomSectionById(currentUser, customSectionId) {
  const { QuotationFormatCustomSection, Users } = db;
  const userCompanyId = currentUser.company_id;
  const userBuilderId = currentUser.builder_id;

  const customSection = await QuotationFormatCustomSection.findOne({
    where: {
      custom_section_id: customSectionId,
      [Op.or]: [
        { company_id: userCompanyId, company_id: { [Op.ne]: null } },
        { builder_id: userBuilderId, builder_id: { [Op.ne]: null } },
      ],
    },
    // include: [
    //   { model: Users, as: "createdByUser", attributes: ["name"] },
    //   { model: Users, as: "updatedByUser", attributes: ["name"] },
    // ],
  });

  if (!customSection) {
    throw {
      status: 404,
      message: "Custom section not found",
    };
  }

  const plain = customSection.get({ plain: true });
  return keysToCamelCase({
    ...plain,
    // createdByName: plain.createdByUser?.name,
    // updatedByName: plain.updatedByUser?.name,
  });
}

async function updateCustomSection(currentUser, customSectionId, payload) {
  const { QuotationFormatCustomSection, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;
    const currentUserId = currentUser.users_id;

    const customSection = await QuotationFormatCustomSection.findOne({
      where: {
        custom_section_id: customSectionId,
        [Op.or]: [
          { company_id: userCompanyId, company_id: { [Op.ne]: null } },
          { builder_id: userBuilderId, builder_id: { [Op.ne]: null } },
        ],
      },
      transaction,
    });

    if (!customSection) {
      throw {
        status: 404,
        message: "Custom section not found",
      };
    }

    const { sort_order, field_name } = payload;
    const existingSortOrder = customSection.sort_order;
    const quotationFormatId = customSection.quotation_format_id;

    if (field_name && field_name !== customSection.field_name) {
      const duplicateCheck = await QuotationFormatCustomSection.findOne({
        where: {
          field_name,
          quotation_format_id: quotationFormatId,
          custom_section_id: { [Op.ne]: customSectionId },
          [Op.or]: [
            { company_id: userCompanyId, company_id: { [Op.ne]: null } },
            { builder_id: userBuilderId, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });

      if (duplicateCheck) {
        throw {
          status: 409,
          message: "Custom section field name already exists in this format",
        };
      }
    }

    // Sort order logic
    if (sort_order !== undefined && sort_order !== null && sort_order !== existingSortOrder) {
      const totalSections = await QuotationFormatCustomSection.count({
        where: { quotation_format_id: quotationFormatId },
        transaction,
      });

      if (sort_order < 1 || sort_order > totalSections) {
        throw {
          status: 400,
          message: `Invalid sort_order. Range is 1 to ${totalSections}`,
        };
      }

      if (sort_order > existingSortOrder) {
        await QuotationFormatCustomSection.decrement("sort_order", {
          by: 1,
          where: {
            quotation_format_id: quotationFormatId,
            sort_order: { [Op.gt]: existingSortOrder, [Op.lte]: sort_order },
          },
          transaction,
        });
      } else {
        await QuotationFormatCustomSection.increment("sort_order", {
          by: 1,
          where: {
            quotation_format_id: quotationFormatId,
            sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSortOrder },
          },
          transaction,
        });
      }
    }

    const updateData = {
      ...payload,
      updated_by: currentUserId,
      updated_at: new Date(),
    };

    await customSection.update(updateData, { transaction });
    await transaction.commit();

    return keysToCamelCase(customSection.get({ plain: true }));
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

async function deleteCustomSection(currentUser, customSectionId) {
  const { QuotationFormatCustomSection, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    const customSection = await QuotationFormatCustomSection.findOne({
      where: {
        custom_section_id: customSectionId,
        [Op.or]: [
          { company_id: userCompanyId, company_id: { [Op.ne]: null } },
          { builder_id: userBuilderId, builder_id: { [Op.ne]: null } },
        ],
      },
      transaction,
    });

    if (!customSection) {
      throw {
        status: 404,
        message: "Custom section not found",
      };
    }

    const deletedSortOrder = customSection.sort_order;
    const quotationFormatId = customSection.quotation_format_id;

    await customSection.destroy({ transaction });

    await QuotationFormatCustomSection.decrement("sort_order", {
      by: 1,
      where: {
        quotation_format_id: quotationFormatId,
        sort_order: { [Op.gt]: deletedSortOrder },
      },
      transaction,
    });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

export default {
  createCustomSection,
  getCustomSections,
  getCustomSectionById,
  updateCustomSection,
  deleteCustomSection,
};