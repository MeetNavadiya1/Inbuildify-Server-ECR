import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { Op } from "sequelize";

// ============================================================
//        MASTER SECTION CRUD OPERATIONS
// ============================================================

async function createMasterSection(currentUser, quotation_format_id, payload) {
  const { MasterSection, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const { master_name, status } = payload;
    const currentUserId = currentUser.users_id;
    const companyId = currentUser.company_id;
    const builderId = currentUser.builder_id;

    const duplicateCheck = await MasterSection.findOne({
      where: {
        master_name,
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
        message: "Master section with this name already exists in the specified scope",
      };
    }

    const newMasterSection = await MasterSection.create(
      {
        company_id: companyId,
        builder_id: builderId,
        quotation_format_id,
        master_name,
        status: status !== undefined ? status : true,
        created_by: currentUserId,
        updated_by: currentUserId,
      },
      { transaction }
    );

    await transaction.commit();
    return keysToCamelCase(newMasterSection.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getMasterSections(currentUser, filters = {}) {
  const { MasterSection, Users, Company, Builder } = db;
  const userCompanyId = currentUser.company_id;
  const userBuilderId = currentUser.builder_id;
  const { page = 1, limit = 25, search, status, quotation_format_id } = filters;
  const offset = (page - 1) * limit;

  const where = {
    [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
  };

  if (quotation_format_id) {
    where.quotation_format_id = quotation_format_id;
  }
  if (search) {
    where.master_name = { [Op.iLike]: `%${search}%` };
  }
  if (status !== undefined) {
    where.status = status;
  }

  const { rows, count } = await MasterSection.findAndCountAll({
    where,
    // include: [
    //   { model: Users, as: "createdByUser", attributes: ["name"] },
    //   { model: Users, as: "updatedByUser", attributes: ["name"] },
    //   { model: Company, as: "company", attributes: ["name"] },
    //   { model: Builder, as: "builder", attributes: ["name"] },
    // ],
    order: [["created_at", "DESC"]],
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  const masterSections = rows.map((row) => {
    const plain = row.get({ plain: true });
    return {
      ...plain,
      // createdByName: plain.createdByUser?.name,
      // updatedByName: plain.updatedByUser?.name,
      // organizationName: plain.company?.name || plain.builder?.name,
    };
  });

  return {
    masterSections: keysToCamelCase(masterSections),
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / limit),
      totalRecords: count,
      limit: parseInt(limit),
    },
  };
}

export async function getMasterSectionById(currentUser, masterSectionId) {
  const { MasterSection, Users, Company, Builder } = db;
  const userCompanyId = currentUser.company_id;
  const userBuilderId = currentUser.builder_id;

  const masterSection = await MasterSection.findOne({
    where: {
      master_section_id: masterSectionId,
      [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
    },
    // include: [
    //   { model: Users, as: "createdByUser", attributes: ["name"] },
    //   { model: Users, as: "updatedByUser", attributes: ["name"] },
    //   { model: Company, as: "company", attributes: ["name"] },
    //   { model: Builder, as: "builder", attributes: ["name"] },
    // ],
  });

  if (!masterSection) {
    throw {
      status: 404,
      message: "Master section not found or does not belong to your organization",
    };
  }

  const plain = masterSection.get({ plain: true });
  return keysToCamelCase({
    ...plain,
    // createdByName: plain.createdByUser?.name,
    // updatedByName: plain.updatedByUser?.name,
    // organizationName: plain.company?.name || plain.builder?.name,
  });
}

export async function updateMasterSection(currentUser, masterSectionId, payload) {
  const { MasterSection, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const { master_name, status } = payload;
    const currentUserId = currentUser.users_id;
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    const existing = await MasterSection.findOne({
      where: {
        master_section_id: masterSectionId,
        [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
      },
      transaction,
    });

    if (!existing) {
      throw {
        status: 404,
        message: "Master section not found or does not belong to your organization",
      };
    }

    if (master_name && master_name !== existing.master_name) {
      const duplicateCheck = await MasterSection.findOne({
        where: {
          master_name,
          master_section_id: { [Op.ne]: masterSectionId },
          [Op.or]: [
            { company_id: existing.company_id, company_id: { [Op.ne]: null } },
            { builder_id: existing.builder_id, builder_id: { [Op.ne]: null } },
          ],
        },
        transaction,
      });

      if (duplicateCheck) {
        throw {
          status: 409,
          message: "Master section with this name already exists in the same scope",
        };
      }
    }

    const updateData = { updated_by: currentUserId };
    if (master_name !== undefined) updateData.master_name = master_name;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length <= 1) {
      throw {
        status: 400,
        message: "At least one field must be provided for update",
      };
    }

    await existing.update(updateData, { transaction });
    await transaction.commit();

    return keysToCamelCase(existing.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteMasterSection(currentUser, masterSectionId) {
  const { MasterSection, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const userCompanyId = currentUser.company_id;
    const userBuilderId = currentUser.builder_id;

    const existing = await MasterSection.findOne({
      where: {
        master_section_id: masterSectionId,
        [Op.or]: [{ company_id: userCompanyId }, { builder_id: userBuilderId }],
      },
      transaction,
    });

    if (!existing) {
      throw {
        status: 404,
        message: "Master section not found or does not belong to your organization",
      };
    }

    await existing.destroy({ transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function copyMasterSection(currentUser, masterSectionId, payload) {
  const { MasterSection, MasterSectionHeader, MasterSectionItem, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const currentUserId = currentUser.users_id;
    const companyId = currentUser.company_id;
    const builderId = currentUser.builder_id;

    // Find the source MasterSection
    const sourceSection = await MasterSection.findOne({
      where: {
        master_section_id: masterSectionId,
        [Op.or]: [
          { company_id: companyId, company_id: { [Op.ne]: null } },
          { builder_id: builderId, builder_id: { [Op.ne]: null } },
        ],
      },
      transaction,
    });

    if (!sourceSection) {
      throw {
        status: 404,
        message: "Master section not found or does not belong to your organization",
      };
    }

    // Determine target name (default: "Name - Copy")
    const targetName = `${sourceSection.master_name} - Copy`;

    // Check for duplicate in the same scope
    const duplicateCheck = await MasterSection.findOne({
      where: {
        master_name: targetName,
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
        message: "Master section with this name already exists in the specified scope",
      };
    }

    // Create the new cloned MasterSection
    const newMasterSection = await MasterSection.create(
      {
        company_id: companyId,
        builder_id: builderId,
        quotation_format_id: sourceSection.quotation_format_id,
        master_name: targetName,
        status: sourceSection.status,
        created_by: currentUserId,
        updated_by: currentUserId,
      },
      { transaction }
    );

    // Fetch all headers belonging to the source section
    const headers = await MasterSectionHeader.findAll({
      where: { master_section_id: masterSectionId },
      transaction,
    });

    // Loop through headers and copy them with items
    for (const header of headers) {
      const newHeader = await MasterSectionHeader.create(
        {
          master_section_id: newMasterSection.master_section_id,
          heading_name: header.heading_name,
          effective_start_date: header.effective_start_date,
          effective_end_date: header.effective_end_date,
          sort_order: header.sort_order,
          status: header.status,
        },
        { transaction }
      );

      // Fetch items belonging to the source header
      const items = await MasterSectionItem.findAll({
        where: { master_section_header_id: header.master_section_header_id },
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
    }

    await transaction.commit();
    return keysToCamelCase(newMasterSection.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ============================================================
//        MASTER SECTION ITEM CRUD OPERATIONS
// ============================================================

export default {
  // Master Section
  createMasterSection,
  getMasterSections,
  getMasterSectionById,
  updateMasterSection,
  deleteMasterSection,
  copyMasterSection,
};