import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";

/**
 * CREATE CONTRACT SECTION
 */
export async function createContractSectionService(payload, userContext) {
  const { ContractFormat, ContractSection, sequelize, Sequelize } = db;
  const { Op } = Sequelize;
  const { builderId, companyId, userId } = userContext;

  const { contract_format_id, section_name } = payload;
  let { sort_order } = payload;

  const section_url =
    (payload.sectionUrl === "" ? null : payload.sectionUrl) ||
    (payload.section_url === "" ? null : payload.section_url) ||
    null;

  if (!contract_format_id) {
    const error = new Error("contract_format_id is required.");
    error.status = 400;
    throw error;
  }

  if (!section_name) {
    const error = new Error("section_name is required.");
    error.status = 400;
    throw error;
  }

  const transaction = await sequelize.transaction();
  try {
    const orClause = {
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    };

    // 1. Verify Format exists
    const format = await ContractFormat.findOne({
      where: {
        contract_format_id,
        ...orClause,
      },
      transaction,
    });

    if (!format) {
      const error = new Error("Contract format not found or access denied.");
      error.status = 404;
      throw error;
    }

    // 2. Resolve and validate sort_order
    const count = await ContractSection.count({
      where: { contract_format_id },
      transaction,
    });

    if (sort_order == null) {
      sort_order = count + 1;
    } else {
      sort_order = parseInt(sort_order);
    }

    if (sort_order < 1 || sort_order > count + 1) {
      const error = new Error(`Invalid sort order. User can enter only 1 to ${count + 1} sortOrder`);
      error.status = 400;
      throw error;
    }

    // 3. Shift sort_order to make room (only if inserting before the end)
    if (sort_order <= count) {
      await ContractSection.increment("sort_order", {
        by: 1,
        where: {
          contract_format_id,
          sort_order: { [Op.gte]: sort_order },
        },
        transaction,
      });
    }

    // 4. Create record
    const contractSection = await ContractSection.create(
      {
        contract_format_id,
        section_name,
        sort_order,
        section_url,
      },
      { transaction },
    );

    await transaction.commit();

    const plain = contractSection.get({ plain: true });
    return keysToCamelCase({
      ...plain,
      created_at: null,
      updated_at: null,
    });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * GET ALL CONTRACT SECTIONS
 */
export async function getAllContractSectionsService(queryParams, userContext) {
  const { ContractSection, ContractFormat, Sequelize } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  let { page = 1, limit = 25, contract_format_id, section_name } = queryParams;
  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  const orClause = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  const where = {};
  if (contract_format_id) {
    where.contract_format_id = contract_format_id;
  }
  if (section_name) {
    where.section_name = { [Op.iLike]: `%${section_name}%` };
  }

  const { rows, count } = await ContractSection.findAndCountAll({
    where,
    include: [
      {
        model: ContractFormat,
        as: "contractFormat",
        where: orClause,
        attributes: [],
        required: true,
      },
    ],
    order: [
      ["contract_format_id", "ASC"],
      ["sort_order", "ASC"],
    ],
    limit,
    offset,
    distinct: true,
  });

  return {
    contractSections: keysToCamelCase(rows.map((r) => r.get({ plain: true }))),
    totalRecords: count,
    currentPage: page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
}

/**
 * GET CONTRACT SECTION BY ID
 */
export async function getContractSectionByIdService(id, userContext) {
  const { ContractSection, ContractFormat, Sequelize } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const orClause = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  const record = await ContractSection.findOne({
    where: { contract_section_id: id },
    include: [
      {
        model: ContractFormat,
        as: "contractFormat",
        where: orClause,
        attributes: [],
        required: true,
      },
    ],
  });

  if (!record) {
    const error = new Error("Contract section not found.");
    error.status = 404;
    throw error;
  }

  return keysToCamelCase(record.get({ plain: true }));
}

/**
 * UPDATE CONTRACT SECTION
 */
export async function updateContractSectionService(id, payload, userContext) {
  const { ContractFormat, ContractSection, sequelize, Sequelize } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const { section_name } = payload;
  let { sort_order } = payload;

  const section_url =
    (payload.sectionUrl === "" ? null : payload.sectionUrl) ||
    (payload.section_url === "" ? null : payload.section_url);

  const transaction = await sequelize.transaction();
  try {
    const orClause = {
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    };

    // 1. Verify existence and ownership
    const existingSection = await ContractSection.findOne({
      where: { contract_section_id: id },
      include: [
        {
          model: ContractFormat,
          as: "contractFormat",
          where: orClause,
          required: true,
        },
      ],
      transaction,
    });

    if (!existingSection) {
      const error = new Error("Contract section not found.");
      error.status = 404;
      throw error;
    }

    const contractFormatId = existingSection.contract_format_id;
    const updateData = {};

    if (section_name !== undefined) {
      updateData.section_name = section_name;
    }

    // 2. Resolve and validate sort_order
    if (sort_order !== undefined && sort_order !== existingSection.sort_order) {
      sort_order = parseInt(sort_order);

      const count = await ContractSection.count({
        where: { contract_format_id: contractFormatId },
        transaction,
      });

      // Validate sort_order range
      if (sort_order < 1 || sort_order > count) {
        const error = new Error(`Invalid sort order. User can enter only 1 to ${count} sortOrder`);
        error.status = 400;
        throw error;
      }

      // 3. Shift sort_order to rebalance
      if (sort_order > existingSection.sort_order) {
        // Moving down (e.g., 2 -> 4). Items between 2 and 4 (3, 4) shift up (3->2, 4->3)
        await ContractSection.decrement("sort_order", {
          by: 1,
          where: {
            contract_format_id: contractFormatId,
            sort_order: {
              [Op.gt]: existingSection.sort_order,
              [Op.lte]: sort_order,
            },
            contract_section_id: { [Op.ne]: id },
          },
          transaction,
        });
      } else {
        // Moving up (e.g., 4 -> 2). Items between 2 and 4 (2, 3) shift down (2->3, 3->4)
        await ContractSection.increment("sort_order", {
          by: 1,
          where: {
            contract_format_id: contractFormatId,
            sort_order: {
              [Op.gte]: sort_order,
              [Op.lt]: existingSection.sort_order,
            },
            contract_section_id: { [Op.ne]: id },
          },
          transaction,
        });
      }

      updateData.sort_order = sort_order;
    }

    // 4. Handle section_url and S3 deletion
    if (section_url !== undefined) {
      if (section_url !== existingSection.section_url && existingSection.section_url) {
        await deleteFromS3(existingSection.section_url);
      }
      updateData.section_url = section_url;
    }

    if (Object.keys(updateData).length === 0) {
      const error = new Error("No fields provided for update.");
      error.status = 400;
      throw error;
    }

    // 5. Update record
    await existingSection.update(updateData, { transaction });

    await transaction.commit();
    const plain = existingSection.get({ plain: true });
    return keysToCamelCase({
      ...plain,
      created_at: null,
    });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * DELETE CONTRACT SECTION
 */
export async function deleteContractSectionService(id, userContext) {
  const { ContractFormat, ContractSection, sequelize, Sequelize } = db;
  const { Op } = Sequelize;
  const { builderId, companyId } = userContext;

  const transaction = await sequelize.transaction();
  try {
    const orClause = {
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    };

    // 1. Verify existence and ownership
    const existingSection = await ContractSection.findOne({
      where: { contract_section_id: id },
      include: [
        {
          model: ContractFormat,
          as: "contractFormat",
          where: orClause,
          required: true,
        },
      ],
      transaction,
    });

    if (!existingSection) {
      const error = new Error("Contract section not found.");
      error.status = 404;
      throw error;
    }

    const { contract_format_id, sort_order, section_url } = existingSection;

    // 2. Handle S3 deletion
    if (section_url) {
      await deleteFromS3(section_url);
    }

    // 3. Delete record
    await existingSection.destroy({ transaction });

    // 4. Rebalance sort_order
    await ContractSection.decrement("sort_order", {
      by: 1,
      where: {
        contract_format_id,
        sort_order: { [Op.gt]: sort_order },
      },
      transaction,
    });

    await transaction.commit();
    return "Contract section deleted successfully.";
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}
