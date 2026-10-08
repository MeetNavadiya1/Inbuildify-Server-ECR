import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * CREATE CONTRACT FORMAT
 */
export async function createContractFormat(payload, userContext) {
  const { ContractFormat, Builder, sequelize, Sequelize } = db;
  const { Op } = Sequelize;
  const { companyId, builderId, userId } = userContext;

  if (!payload.format_name) {
    const error = new Error("format_name is required.");
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

    // 1. Duplicate Check (Case-Insensitive)
    const duplicate = await ContractFormat.findOne({
      where: {
        ...orClause,
        format_name: { [Op.iLike]: payload.format_name },
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("Contract format with this name already exists.");
      error.status = 409;
      throw error;
    }

    // 2. Default Format Rebalancing
    if (payload.default_format) {
      await ContractFormat.update(
        { default_format: false },
        {
          where: { ...orClause },
          transaction,
        },
      );
    }

    // 3. Creation
    const contractFormat = await ContractFormat.create(
      {
        company_id: companyId,
        builder_id: builderId,
        builder: payload.builder || null,
        format_name: payload.format_name,
        default_format: payload.default_format || false,
        status: payload.status !== undefined ? payload.status : true,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    // 4. Fetch with Builder Info
    const result = await ContractFormat.findByPk(contractFormat.contract_format_id, {
      include: [
        {
          model: Builder,
          as: "builderRef",
          attributes: ["builder_id", "name"],
        },
      ],
      transaction,
    });

    await transaction.commit();

    const transformed = keysToCamelCase(result.get({ plain: true }));

    // 5. Structure Final Response
    return {
      contractFormatId: transformed.contractFormatId,
      companyId: transformed.companyId,
      builderId: transformed.builderId,
      builder: transformed.builderRef?.builderId || null,
      builderName: transformed.builderRef?.name || null,
      formatName: transformed.formatName,
      defaultFormat: transformed.defaultFormat,
      status: transformed.status,
      createdBy: transformed.createdBy,
      updatedBy: transformed.updatedBy,
      createdAt: transformed.createdAt,
      updatedAt: transformed.updatedAt,
      // Seeded demo record — badged in the UI, and left out of the pickers on a
      // "create new" form (Settings → Sample Data clears it).
      isSampleData: transformed.isSampleData === true,
    };
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * UPDATE CONTRACT FORMAT
 */
export async function updateContractFormatService(id, payload, userContext) {
  const { ContractFormat, Builder, sequelize, Sequelize } = db;
  const { Op } = Sequelize;
  const { companyId, builderId, userId } = userContext;

  const { format_name, default_format, status, builder } = payload;

  const transaction = await sequelize.transaction();
  try {
    const orClause = {
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    };

    // 1. Verify existence and ownership
    const existing = await ContractFormat.findOne({
      where: {
        contract_format_id: id,
        ...orClause,
      },
      transaction,
    });

    if (!existing) {
      const error = new Error("Contract format not found.");
      error.status = 404;
      throw error;
    }

    const updateData = {};

    // 2. Duplicate Check
    if (format_name !== undefined) {
      const duplicate = await ContractFormat.findOne({
        where: {
          ...orClause,
          format_name: { [Op.iLike]: format_name },
          contract_format_id: { [Op.ne]: id },
        },
        transaction,
      });

      if (duplicate) {
        const error = new Error("Contract format with this name already exists.");
        error.status = 409;
        throw error;
      }
      updateData.format_name = format_name;
    }

    // 3. Default Format Rebalancing
    if (default_format !== undefined) {
      if (default_format && !existing.default_format) {
        await ContractFormat.update(
          { default_format: false },
          {
            where: {
              ...orClause,
              contract_format_id: { [Op.ne]: id },
            },
            transaction,
          },
        );
      }
      updateData.default_format = default_format;
    }

    if (status !== undefined) {
      updateData.status = status;
    }
    if (builder !== undefined) {
      updateData.builder = builder;
    }

    if (Object.keys(updateData).length === 0) {
      const error = new Error("No fields provided for update.");
      error.status = 400;
      throw error;
    }

    updateData.updated_by = userId;

    // 4. Perform Update
    await existing.update(updateData, { transaction });

    // 5. Fetch with Builder Info
    const result = await ContractFormat.findByPk(id, {
      include: [
        {
          model: Builder,
          as: "builderRef",
          attributes: ["builder_id", "name"],
        },
      ],
      transaction,
    });

    await transaction.commit();

    const transformed = keysToCamelCase(result.get({ plain: true }));

    // 6. Structure Final Response to match original raw SQL behavior
    return {
      contractFormatId: transformed.contractFormatId,
      companyId: transformed.companyId,
      builderId: transformed.builderId,
      builder: transformed.builderRef?.builderId || null,
      builderName: transformed.builderRef?.name || null,
      formatName: transformed.formatName,
      defaultFormat: transformed.defaultFormat,
      status: transformed.status,
      createdBy: transformed.createdBy,
      updatedBy: transformed.updatedBy,
      createdAt: transformed.createdAt,
      updatedAt: transformed.updatedAt,
      // Seeded demo record — badged in the UI, and left out of the pickers on a
      // "create new" form (Settings → Sample Data clears it).
      isSampleData: transformed.isSampleData === true,
    };
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * GET ALL CONTRACT FORMATS
 */
export async function getAllContractFormatsService(queryParams, userContext) {
  const { ContractFormat, Builder, Sequelize } = db;
  const { Op } = Sequelize;
  const { companyId, builderId } = userContext;

  const {
    page = 1,
    limit = 25,
    format_name,
    status,
    default_format,
    builder,
    created_at,
    updated_at,
    start_date,
    end_date,
    start_updated_date,
    end_updated_date,
  } = queryParams;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    [Op.or]: [
      { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
      { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
    ],
  };

  if (format_name) {
    where.format_name = { [Op.iLike]: `%${format_name}%` };
  }
  if (status !== undefined) {
    where.status = status === "true" || status === true;
  }
  if (default_format !== undefined) {
    where.default_format = default_format === "true" || default_format === true;
  }
  if (builder) {
    where.builder = builder;
  }

  // Date filters for createdAt
  const applyDateFilter = (preset, start, end, field) => {
    if (preset) {
      const now = new Date();
      let dateFilter;
      switch (preset.toLowerCase()) {
      case "last_7_days":
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "last_15_days":
        dateFilter = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
        break;
      case "last_30_days":
        dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      }
      if (dateFilter) {
        where[field] = { [Op.gte]: dateFilter };
      }
    } else if (start && end) {
      where[field] = { [Op.between]: [new Date(start), new Date(end)] };
    } else if (start) {
      where[field] = { [Op.gte]: new Date(start) };
    } else if (end) {
      where[field] = { [Op.lte]: new Date(end) };
    }
  };

  applyDateFilter(created_at, start_date, end_date, "createdAt");
  applyDateFilter(updated_at, start_updated_date, end_updated_date, "updatedAt");

  const { count, rows } = await ContractFormat.findAndCountAll({
    where,
    include: [
      {
        model: Builder,
        as: "builderRef",
        attributes: ["builder_id", "name"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: parseInt(limit),
    offset,
  });

  const transformedRows = rows.map((row) => {
    const transformed = keysToCamelCase(row.get({ plain: true }));
    return {
      contractFormatId: transformed.contractFormatId,
      companyId: transformed.companyId,
      builderId: transformed.builderId,
      builder: transformed.builderRef?.builderId || null,
      builderName: transformed.builderRef?.name || null,
      formatName: transformed.formatName,
      defaultFormat: transformed.defaultFormat,
      status: transformed.status,
      createdBy: transformed.createdBy,
      updatedBy: transformed.updatedBy,
      createdAt: transformed.createdAt,
      updatedAt: transformed.updatedAt,
      // Seeded demo record — badged in the UI, and left out of the pickers on a
      // "create new" form (Settings → Sample Data clears it).
      isSampleData: transformed.isSampleData === true,
    };
  });

  return {
    contractFormats: transformedRows,
    pagination: {
      totalRecords: count,
      currentPage: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit)),
    },
  };
}

/**
 * GET CONTRACT FORMAT BY ID
 */
export async function getContractFormatByIdService(id, userContext) {
  const { ContractFormat, Builder, Sequelize } = db;
  const { Op } = Sequelize;
  const { companyId, builderId } = userContext;

  const result = await ContractFormat.findOne({
    where: {
      contract_format_id: id,
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    },
    include: [
      {
        model: Builder,
        as: "builderRef",
        attributes: ["builder_id", "name"],
      },
    ],
  });

  if (!result) {
    const error = new Error("Contract format not found.");
    error.status = 404;
    throw error;
  }

  const transformed = keysToCamelCase(result.get({ plain: true }));

  return {
    contractFormatId: transformed.contractFormatId,
    companyId: transformed.companyId,
    builderId: transformed.builderId,
    builder: transformed.builderRef?.builderId || null,
    builderName: transformed.builderRef?.name || null,
    formatName: transformed.formatName,
    defaultFormat: transformed.defaultFormat,
    status: transformed.status,
    createdBy: transformed.createdBy,
    updatedBy: transformed.updatedBy,
    createdAt: transformed.createdAt,
    updatedAt: transformed.updatedAt,
    // Seeded demo record — badged in the UI, and left out of the pickers on a
    // "create new" form (Settings → Sample Data clears it).
    isSampleData: transformed.isSampleData === true,
  };
}

/**
 * DELETE CONTRACT FORMAT
 */
export async function deleteContractFormatService(id, userContext) {
  const { ContractFormat, Sequelize } = db;
  const { Op } = Sequelize;
  const { companyId, builderId } = userContext;

  const existing = await ContractFormat.findOne({
    where: {
      contract_format_id: id,
      [Op.or]: [
        { [Op.and]: [{ company_id: companyId }, { company_id: { [Op.ne]: null } }] },
        { [Op.and]: [{ builder_id: builderId }, { builder_id: { [Op.ne]: null } }] },
      ],
    },
  });

  if (!existing) {
    const error = new Error("Contract format not found.");
    error.status = 404;
    throw error;
  }

  await existing.destroy();

  return "Contract format deleted successfully.";
}

export default {
  createContractFormat,
  updateContractFormatService,
  getAllContractFormatsService,
  getContractFormatByIdService,
  deleteContractFormatService,
};
