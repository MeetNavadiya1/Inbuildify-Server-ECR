import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

export const getAllStructureEngineerService = async ({ builderId, companyId, page, limit, search }) => {
  const { StructureEngineer } = db;
  const offset = (page - 1) * limit;
  const where = {
    [Op.and]: [
      {
        [Op.or]: [
          { builder_id: builderId },
          { company_id: companyId },
        ],
      },
    ],
  };

  if (search) {
    where[Op.and].push({
      [Op.or]: [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
      ],
    });
  }

  const { rows, count } = await StructureEngineer.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  return {
    engineers: rows.map((e) => e.toJSON()),
    total: count,
  };
};

export const getStructureEngineerByIdService = async (id, builderId, companyId) => {
  const { StructureEngineer } = db;
  const data = await StructureEngineer.findOne({
    where: {
      structure_engineer_id: id,
      [Op.or]: [
        { builder_id: builderId },
        { company_id: companyId },
      ],
    },
  });

  if (!data) {
    const err = new Error("Structure Engineer not found");
    err.statusCode = 404;
    throw err;
  }

  return data.toJSON();
};

export const createStructureEngineerService = async (payload, user) => {
  const { StructureEngineer, sequelize } = db;
  const { name, email, phone, price, address, is_active } = payload;

  if (email) {
    const duplicate = await StructureEngineer.findOne({
      where: {
        email: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("email")),
          email.toLowerCase(),
        ),
        [Op.or]: [
          { builder_id: user.builder_id },
          { company_id: user.company_id },
        ],
      },
    });

    if (duplicate) {
      const err = new Error("Email already exists");
      err.statusCode = 400;
      throw err;
    }
  }

  const created = await StructureEngineer.create({
    builder_id: user.builder_id,
    company_id: user.company_id,
    name,
    email: email || null,
    phone: phone || null,
    // price is a NOT NULL column (defaults to 0); coalesce null/undefined to 0.
    // Use ?? so a legitimate 0 is preserved rather than turned into a default.
    price: price ?? 0,
    address: address || null,
    is_active: is_active !== undefined ? is_active : true,
    created_by: user.users_id,
    updated_by: user.users_id,
  });

  return created.toJSON();
};

// UPDATE
export const updateStructureEngineerService = async (id, payload, user) => {
  const { StructureEngineer, sequelize } = db;
  const { name, email, phone, price, address, is_active } = payload;

  const existing = await StructureEngineer.findOne({
    where: {
      structure_engineer_id: id,
      [Op.or]: [
        { builder_id: user.builder_id },
        { company_id: user.company_id },
      ],
    },
  });

  if (!existing) {
    const err = new Error("Structure Engineer not found");
    err.statusCode = 404;
    throw err;
  }

  if (email) {
    const duplicate = await StructureEngineer.findOne({
      where: {
        email: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("email")),
          email.toLowerCase(),
        ),
        structure_engineer_id: { [Op.ne]: id },
        [Op.or]: [
          { builder_id: user.builder_id },
          { company_id: user.company_id },
        ],
      },
    });

    if (duplicate) {
      const err = new Error("Email already exists");
      err.statusCode = 400;
      throw err;
    }
  }

  await existing.update({
    ...(name !== undefined && { name }),
    ...(email !== undefined && { email }),
    ...(phone !== undefined && { phone }),
    ...(address !== undefined && { address }),
    ...(price !== undefined && { price: price ?? 0 }),
    ...(is_active !== undefined && { is_active }),
    updated_by: user.users_id,
  });

  return existing.toJSON();
};

export const deleteStructureEngineerService = async (id, builderId, companyId) => {
  const { StructureEngineer } = db;

  const existing = await StructureEngineer.findOne({
    where: {
      structure_engineer_id: id,
      [Op.or]: [
        { builder_id: builderId },
        { company_id: companyId },
      ],
    },
  });

  if (!existing) {
    const err = new Error("Structure Engineer not found");
    err.statusCode = 404;
    throw err;
  }

  await existing.destroy();
  return true;
};
