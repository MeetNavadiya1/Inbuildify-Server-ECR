
import { Op } from "sequelize";
import { keysToCamelCase } from "../../../../utils/common.js";
import db from "../../../../config/database/models/postgre-models/index.js";

async function createMasterSectionHeader(currentUser, master_section_id, payload) {
  const { MasterSection, MasterSectionHeader, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const {
      heading_name,
      effective_start_date,
      effective_end_date,
      sort_order,
      status,
    } = payload;
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    const masterSection = await MasterSection.findOne({
      where: {
        master_section_id: master_section_id,
        [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
        status: true,
      },
      transaction,
    });

    if (!masterSection) {
      throw {
        status: 404,
        message: "Master section not found or inactive  ",
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
      const maxSortOrder = await MasterSectionHeader.max("sort_order", {
        where: { master_section_id },
        transaction,
      });
      finalSortOrder = (maxSortOrder || 0) + 1;
    } else {
      const totalHeaders = await MasterSectionHeader.count({
        where: { master_section_id },
        transaction,
      });
      const maxAllowed = totalHeaders + 1;

      if (finalSortOrder > maxAllowed) {
        throw {
          status: 400,
          message: `Sort order cannot exceed ${maxAllowed}. There are currently ${totalHeaders} headers in this master section.`,
        };
      }
    }

    if (sort_order !== undefined && sort_order !== null) {
      await MasterSectionHeader.increment("sort_order", {
        by: 1,
        where: {
          master_section_id,
          sort_order: { [Op.gte]: sort_order },
        },
        transaction,
      });
    }
    const duplicateCheck = await MasterSectionHeader.findOne({
      where: {
        heading_name,
      },
      transaction,
    });

    if (duplicateCheck) {
      throw {
        status: 409,
        message: "Master section header with this name already exists in the specified scope",
      };
    }

    const newHeader = await MasterSectionHeader.create(
      {
        master_section_id,
        heading_name,
        effective_start_date,
        effective_end_date,
        sort_order: finalSortOrder,
        status: status !== undefined ? status : true,
      },
      { transaction }
    );

    await transaction.commit();
    return keysToCamelCase(newHeader.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getMasterSectionHeaders(currentUser, filters = {}) {
  const { MasterSection, MasterSectionHeader, Company, Builder } = db;
  const userCompanyId = currentUser.company_id;
  const userBuilderId = currentUser.builder_id;
  const { page = 1, limit = 25, search, status, master_section_id } = filters;
  const offset = (page - 1) * limit;

  const where = {};

  if (master_section_id) {
    where.master_section_id = master_section_id;
  }

  if (search) {
    where.heading_name = { [Op.iLike]: `%${search}%` };
  }

  if (status !== undefined) {
    where.status = status;
  }

  const { rows, count } = await MasterSectionHeader.findAndCountAll({
    where,
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
    order: [
      [{ model: MasterSection, as: "masterSection" }, "master_name", "ASC"], // Or sorted by sequence if available
      ["sort_order", "ASC"],
      ["created_at", "DESC"],
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  const headers = rows.map((row) => {
    const plain = row.get({ plain: true });
    return {
      ...plain,
      organizationName:
        plain.masterSection?.company?.name || plain.masterSection?.builder?.name,
    };
  });

  return {
    headers: keysToCamelCase(headers),
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / limit),
      totalRecords: count,
      limit: parseInt(limit),
    },
  };
}

export async function getMasterSectionHeaderById(currentUser, headerId) {
  const { MasterSection, MasterSectionHeader, Company, Builder } = db;
  const userCompanyId = currentUser.company_id;
  const userBuilderId = currentUser.builder_id;

  const header = await db.MasterSectionHeader.findOne({
    where: { master_section_header_id: headerId },
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
  });
  console.log("🚀 ~ getMasterSectionHeaderById ~ header:", header)

  if (!header) {
    throw {
      status: 404,
      message: "Master section header not found or does not belong to your organization",
    };
  }

  const plain = header.get({ plain: true });
  return keysToCamelCase({
    ...plain,
    masterName: plain.masterSection?.master_name,
    organizationName:
      plain.masterSection?.company?.name || plain.masterSection?.builder?.name,
  });
}

export async function updateMasterSectionHeader(currentUser, headerId, payload) {
  const { MasterSection, MasterSectionHeader, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const {
      heading_name,
      effective_start_date,
      effective_end_date,
      sort_order,
      status,
    } = payload;
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    const existing = await MasterSectionHeader.findOne({
      where: { master_section_header_id: headerId },
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
      transaction,
    });

    if (!existing) {
      throw {
        status: 404,
        message: "Master section header not found or does not belong to your organization",
      };
    }

    const existingSortOrder = existing.sort_order;
    const masterSectionId = existing.master_section_id;

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

    if (sort_order !== undefined && sort_order !== existingSortOrder) {
      const totalHeaders = await MasterSectionHeader.count({
        where: { master_section_id: masterSectionId },
        transaction,
      });

      if (sort_order > totalHeaders) {
        throw {
          status: 400,
          message: `Sort order cannot exceed ${totalHeaders}. There are currently ${totalHeaders} headers in this master section.`,
        };
      }

      // Shifting logic
      if (sort_order > existingSortOrder) {
        await MasterSectionHeader.decrement("sort_order", {
          by: 1,
          where: {
            master_section_id: masterSectionId,
            sort_order: { [Op.gt]: existingSortOrder, [Op.lte]: sort_order },
          },
          transaction,
        });
      } else {
        await MasterSectionHeader.increment("sort_order", {
          by: 1,
          where: {
            master_section_id: masterSectionId,
            sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSortOrder },
          },
          transaction,
        });
      }
    }
    const duplicateCheck = await MasterSectionHeader.findOne({
      where: {
        heading_name,
      },
      transaction,
    });

    if (duplicateCheck) {
      throw {
        status: 409,
        message: "Master section header with this name already exists in the specified scope",
      };
    }

    const updateData = { updated_at: new Date() };
    if (heading_name !== undefined) updateData.heading_name = heading_name;
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

export async function deleteMasterSectionHeader(currentUser, headerId) {
  const { MasterSection, MasterSectionHeader, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    const existing = await MasterSectionHeader.findOne({
      where: { master_section_header_id: headerId },
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
      transaction,
    });

    if (!existing) {
      throw {
        status: 404,
        message: "Master section header not found or does not belong to your organization",
      };
    }

    const deletedSortOrder = existing.sort_order;
    const masterSectionId = existing.master_section_id;
    console.log("🚀 ~ deleteMasterSectionHeader ~ masterSectionId:", masterSectionId)

    await existing.destroy({ transaction });

    await MasterSectionHeader.decrement("sort_order", {
      by: 1,
      where: {
        master_section_id: masterSectionId,
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

export async function copyMasterSectionHeader(currentUser, headerId, payload) {
  const { MasterSection, MasterSectionHeader, MasterSectionItem, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    // Find the source MasterSectionHeader
    const sourceHeader = await MasterSectionHeader.findOne({
      where: { master_section_header_id: headerId },
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
      transaction,
    });

    if (!sourceHeader) {
      throw {
        status: 404,
        message: "Master section header not found or does not belong to your organization",
      };
    }

    const masterSectionId = sourceHeader.master_section_id;

    // Determine target name (default: "Name - Copy")
    const targetName = `${sourceHeader.heading_name} - Copy`;

    // Check for duplicate in the same master section scope
    const duplicateCheck = await MasterSectionHeader.findOne({
      where: {
        master_section_id: masterSectionId,
        heading_name: targetName,
      },
      transaction,
    });

    if (duplicateCheck) {
      throw {
        status: 409,
        message: "Master section header with this name already exists in the specified scope",
      };
    }

    // Determine sort order
    const maxSortOrder = await MasterSectionHeader.max("sort_order", {
      where: { master_section_id: masterSectionId },
      transaction,
    });
    const finalSortOrder = (maxSortOrder || 0) + 1;

    // Create the new MasterSectionHeader
    const newHeader = await MasterSectionHeader.create(
      {
        master_section_id: masterSectionId,
        heading_name: targetName,
        effective_start_date: sourceHeader.effective_start_date,
        effective_end_date: sourceHeader.effective_end_date,
        sort_order: finalSortOrder,
        status: sourceHeader.status,
      },
      { transaction }
    );

    // Fetch items belonging to the source header
    const items = await MasterSectionItem.findAll({
      where: { master_section_header_id: headerId },
      transaction,
    });

    if (items.length > 0) {
      // Bulk create items linked to the new header ID
      const itemsToCreate = items.map((item) => ({
        master_section_header_id: newHeader.master_section_header_id,
        item_name: item.item_name,
        effective_start_date: item.effective_start_date,
        effective_end_date: item.effective_end_date,
        sort_order: item.sort_order,
        status: item.status,
      }));

      await MasterSectionItem.bulkCreate(itemsToCreate, { transaction });
    }

    await transaction.commit();
    return keysToCamelCase(newHeader.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export default {
  // Master Section Header
  createMasterSectionHeader,
  getMasterSectionHeaders,
  getMasterSectionHeaderById,
  updateMasterSectionHeader,
  deleteMasterSectionHeader,
  copyMasterSectionHeader,
};