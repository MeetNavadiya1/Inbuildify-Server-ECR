// ============================================================
//        MASTER SECTION ITEM CRUD OPERATIONS
// ============================================================

import { Op } from "sequelize";
import db from "../../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../../utils/common.js";

async function createMasterSectionItem(currentUser, master_section_header_id, payload) {
  const { MasterSectionItem, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const {
      item_name,
      effective_start_date,
      effective_end_date,
      sort_order,
      status,
    } = payload;
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    const header = await db.MasterSectionHeader.findOne({
      where: { master_section_header_id: master_section_header_id },
      include: [
        {
          model: db.MasterSection,
          as: "masterSection",
          required: true,
          where: {
            [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
          },
        },
      ],
      transaction,
    });
    if (payload.item_name) {
      const duplicate = await db.MasterSectionItem.findOne({
        where: {
          item_name: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("item_name")),
            sequelize.fn("LOWER", payload.item_name)
          ),
        },
        transaction,
      });

      if (duplicate) {
        const error = new Error("item name already exists.");
        error.status = 409;
        throw error;
      }
    }

    if (!header) {
      throw {
        status: 404,
        message: "Master section header not found or does not belong to your organization",
      };
    }

    if (effective_start_date && effective_end_date) {
      const startDate = new Date(effective_start_date);
      const endDate = new Date(effective_end_date);
      if (startDate > endDate) {
        throw {
          status: 400,
          message: "Effective start date cannot be after effective end date",
        };
      }
    }

    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const maxSortOrder = await MasterSectionItem.max("sort_order", {
        where: { master_section_header_id },
        transaction,
      });
      finalSortOrder = (maxSortOrder || 0) + 1;
    } else {
      const totalItems = await MasterSectionItem.count({
        where: { master_section_header_id },
        transaction,
      });
      const maxAllowed = totalItems + 1;

      if (finalSortOrder > maxAllowed) {
        throw {
          status: 400,
          message: `Sort order cannot exceed ${maxAllowed}. There are currently ${totalItems} items in this header.`,
        };
      }
    }

    if (sort_order !== undefined && sort_order !== null) {
      await MasterSectionItem.increment("sort_order", {
        by: 1,
        where: {
          master_section_header_id,
          sort_order: { [Op.gte]: sort_order },
        },
        transaction,
      });
    }

    const newItem = await MasterSectionItem.create(
      {
        master_section_header_id,
        item_name,
        effective_start_date,
        effective_end_date,
        sort_order: finalSortOrder,
        status: status !== undefined ? status : true,
      },
      { transaction }
    );

    await transaction.commit();
    return keysToCamelCase(newItem.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getMasterSectionItems(currentUser, filters = {}) {
  const {
    MasterSection,
    MasterSectionHeader,
    MasterSectionItem,
    Company,
    Builder,
  } = db;
  const userCompanyId = currentUser.company_id;
  const userBuilderId = currentUser.builder_id;
  const {
    page = 1,
    limit = 25,
    search,
    status,
    master_section_header_id,
  } = filters;
  const offset = (page - 1) * limit;

  const where = {};

  if (master_section_header_id) {
    where.master_section_header_id = master_section_header_id;
  }

  if (search) {
    where.item_name = { [Op.iLike]: `%${search}%` };
  }

  if (status !== undefined) {
    where.status = status;
  }

  const { rows, count } = await MasterSectionItem.findAndCountAll({
    where,
    include: [
      {
        model: MasterSectionHeader,
        as: "masterSectionHeader",
        required: true,
        include: [
          {
            model: MasterSection,
            as: "masterSection",
            required: true,
            where: {
              [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
            },
            attributes: ["master_name"],
            include: [
              { model: Company, as: "company", attributes: ["name"] },
              { model: Builder, as: "builder", attributes: ["name"] },
            ],
          },
        ],
        attributes: ["heading_name", "master_section_id"],
      },
    ],
    order: [
      [{ model: MasterSectionHeader, as: "masterSectionHeader" }, { model: MasterSection, as: "masterSection" }, "master_name", "ASC"],
      [{ model: MasterSectionHeader, as: "masterSectionHeader" }, "sort_order", "ASC"],
      ["sort_order", "ASC"],
      ["created_at", "DESC"],
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  const items = rows.map((row) => {
    const plain = row.get({ plain: true });
    return {
      ...plain,
      headingName: plain.masterSectionHeader?.heading_name,
      masterName: plain.masterSectionHeader?.masterSection?.master_name,
      organizationName:
        plain.masterSectionHeader?.masterSection?.company?.name ||
        plain.masterSectionHeader?.masterSection?.builder?.name,
    };
  });

  return {
    items: keysToCamelCase(items),
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / limit),
      totalRecords: count,
      limit: parseInt(limit),
    },
  };
}

export async function getMasterSectionItemById(currentUser, itemId) {
  const {
    MasterSection,
    MasterSectionHeader,
    MasterSectionItem,
    Company,
    Builder,
  } = db;
  const userCompanyId = currentUser.company_id;
  const userBuilderId = currentUser.builder_id;

  const item = await MasterSectionItem.findOne({
    where: { master_section_item_id: itemId },
    include: [
      {
        model: MasterSectionHeader,
        as: "masterSectionHeader",
        required: true,
        include: [
          {
            model: MasterSection,
            as: "masterSection",
            required: true,
            where: {
              [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
            },
            attributes: ["master_name"],
            include: [
              { model: Company, as: "company", attributes: ["name"] },
              { model: Builder, as: "builder", attributes: ["name"] },
            ],
          },
        ],
        attributes: ["heading_name"],
      },
    ],
  });

  if (!item) {
    throw {
      status: 404,
      message: "Master section item not found or does not belong to your organization",
    };
  }

  const plain = item.get({ plain: true });
  return keysToCamelCase({
    ...plain,
    headingName: plain.masterSectionHeader?.heading_name,
    masterName: plain.masterSectionHeader?.masterSection?.master_name,
    organizationName:
      plain.masterSectionHeader?.masterSection?.company?.name ||
      plain.masterSectionHeader?.masterSection?.builder?.name,
  });
}

export async function updateMasterSectionItem(currentUser, itemId, payload) {
  const { MasterSectionHeader, MasterSectionItem, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const {
      item_name,
      effective_start_date,
      effective_end_date,
      sort_order,
      status,
    } = payload;
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    const existing = await MasterSectionItem.findOne({
      where: { master_section_item_id: itemId },
      include: [
        {
          model: MasterSectionHeader,
          as: "masterSectionHeader",
          required: true,
          include: [
            {
              model: db.MasterSection,
              as: "masterSection",
              required: true,
              where: {
                [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
              },
            },
          ],
        },
      ],
      transaction,
    });

    if (!existing) {
      throw {
        status: 404,
        message: "Master section item not found or does not belong to your organization",
      };
    }

    if (effective_start_date && effective_end_date) {
      const startDate = new Date(effective_start_date);
      const endDate = new Date(effective_end_date);
      if (startDate > endDate) {
        throw {
          status: 400,
          message: "Effective start date cannot be after effective end date",
        };
      }
    }

    const existingSortOrder = existing.sort_order;
    const headerId = existing.master_section_header_id;

    if (sort_order !== undefined && sort_order !== existingSortOrder) {
      const totalItems = await MasterSectionItem.count({
        where: { master_section_header_id: headerId },
        transaction,
      });
      console.log("🚀 ~ updateMasterSectionItem ~ totalItems:", totalItems)

      if (sort_order > totalItems) {
        throw {
          status: 400,
          message: `Sort order cannot excee d ${totalItems}. There are currently ${totalItems} items in this header.`,
        };
      }

      if (sort_order > existingSortOrder) {
        await MasterSectionItem.decrement("sort_order", {
          by: 1,
          where: {
            master_section_header_id: headerId,
            sort_order: { [Op.gt]: existingSortOrder, [Op.lte]: sort_order },
          },
          transaction,
        });
      } else {
        await MasterSectionItem.increment("sort_order", {
          by: 1,
          where: {
            master_section_header_id: headerId,
            sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSortOrder },
          },
          transaction,
        });
      }
    }

    const updateData = { updated_at: new Date() };
    if (item_name !== undefined) updateData.item_name = item_name;
    if (effective_start_date !== undefined)
      updateData.effective_start_date = effective_start_date;
    if (effective_end_date !== undefined)
      updateData.effective_end_date = effective_end_date;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (status !== undefined) updateData.status = status;

    await existing.update(updateData, { transaction });
    await transaction.commit();

    return keysToCamelCase(existing.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteMasterSectionItem(currentUser, itemId) {
  const { MasterSectionHeader, MasterSectionItem, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    const existing = await MasterSectionItem.findOne({
      where: { master_section_item_id: itemId },
      include: [
        {
          model: MasterSectionHeader,
          as: "masterSectionHeader",
          required: true,
          include: [
            {
              model: db.MasterSection,
              as: "masterSection",
              required: true,
              where: {
                [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
              },
            },
          ],
        },
      ],
      transaction,
    });

    if (!existing) {
      throw {
        status: 404,
        message: "Master section item not found or does not belong to your organization",
      };
    }

    const deletedSortOrder = existing.sort_order;
    const headerId = existing.master_section_header_id;

    await existing.destroy({ transaction });

    await MasterSectionItem.decrement("sort_order", {
      by: 1,
      where: {
        master_section_header_id: headerId,
        sort_order: { [Op.gt]: deletedSortOrder },
      },
      transaction,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function copyMasterSectionItem(currentUser, itemId) {
  const { MasterSection, MasterSectionHeader, MasterSectionItem, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    // Find the source MasterSectionItem
    const sourceItem = await MasterSectionItem.findOne({
      where: { master_section_item_id: itemId },
      include: [
        {
          model: MasterSectionHeader,
          as: "masterSectionHeader",
          required: true,
          include: [
            {
              model: MasterSection,
              as: "masterSection",
              required: true,
              where: {
                [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
              },
            },
          ],
        },
      ],
      transaction,
    });

    if (!sourceItem) {
      throw {
        status: 404,
        message: "Master section item not found or does not belong to your organization",
      };
    }

    const masterSectionHeaderId = sourceItem.master_section_header_id;

    // Determine target name (default: "Name - Copy")
    const targetName = `${sourceItem.item_name} - Copy`;

    // Check for duplicate in the same master section header scope
    const duplicateCheck = await MasterSectionItem.findOne({
      where: {
        master_section_header_id: masterSectionHeaderId,
        item_name: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("item_name")),
          sequelize.fn("LOWER", targetName)
        ),
      },
      transaction,
    });

    if (duplicateCheck) {
      throw {
        status: 409,
        message: "Master section item with this name already exists in this scope",
      };
    }

    // Determine sort order
    const maxSortOrder = await MasterSectionItem.max("sort_order", {
      where: { master_section_header_id: masterSectionHeaderId },
      transaction,
    });
    const finalSortOrder = (maxSortOrder || 0) + 1;

    // Create the new MasterSectionItem
    const newItem = await MasterSectionItem.create(
      {
        master_section_header_id: masterSectionHeaderId,
        item_name: targetName,
        effective_start_date: sourceItem.effective_start_date,
        effective_end_date: sourceItem.effective_end_date,
        sort_order: finalSortOrder,
        status: sourceItem.status,
      },
      { transaction }
    );

    await transaction.commit();
    return keysToCamelCase(newItem.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export default {
  // Master Section Item
  createMasterSectionItem,
  getMasterSectionItems,
  getMasterSectionItemById,
  updateMasterSectionItem,
  deleteMasterSectionItem,
  copyMasterSectionItem,
};