import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

// ✅ CREATE
export const createClientTypeService = async (payload, user) => {
  const { ClientType, sequelize } = db;
  const { client_type, sort_order, is_active } = payload;

  return await sequelize.transaction(async (t) => {
    const duplicate = await ClientType.findOne({
      where: {
        builder_id: user.builder_id,
        client_type: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("client_type")),
          client_type.toLowerCase(),
        ),
      },
      transaction: t,
    });

    if (duplicate) {
      const err = new Error("Client type already exists");
      err.statusCode = 400;
      throw err;
    }

    const maxSort = (await ClientType.max("sort_order", {
      where: {
        [Op.or]: [
          { company_id: user.company_id },
          { builder_id: user.builder_id },
        ],
      },
      transaction: t,
    })) || 0;

    const finalSort = sort_order ?? 1;

    if (finalSort < 1 || finalSort > maxSort + 1) {
      const err = new Error(`sort_order must be between 1 and ${maxSort + 1}`);
      err.statusCode = 400;
      throw err;
    }

    await ClientType.increment("sort_order", {
      by: 1,
      where: {
        sort_order: { [Op.gte]: finalSort },
        [Op.or]: [
          { company_id: user.company_id },
          { builder_id: user.builder_id },
        ],
      },
      transaction: t,
    });

    const created = await ClientType.create(
      {
        company_id: user.company_id,
        builder_id: user.builder_id,
        client_type,
        sort_order: finalSort,
        is_active: is_active ?? true,
        created_by: user.user_id,
        updated_by: user.user_id,
      },
      { transaction: t },
    );

    return created.toJSON();
  });
};

// ✅ GET ALL
export const getAllClientTypeService = async (user, page, limit) => {
  const { ClientType } = db;

  const offset = (page - 1) * limit;

  const { count, rows } = await ClientType.findAndCountAll({
    where: {
      company_id: user.company_id,
      builder_id: user.builder_id,
    },
    order: [["sort_order", "ASC"]],
    limit,
    offset,
  });

  return {
    data: rows.map((r) => r.toJSON()),
    total: count,
  };
};

// ✅ DELETE
export const deleteClientTypeService = async (id, builderId) => {
  const { ClientType, sequelize } = db;

  return await sequelize.transaction(async (t) => {
    const existing = await ClientType.findOne({
      where: { client_type_id: id, builder_id: builderId },
      transaction: t,
    });

    if (!existing) {
      const err = new Error("Client type not found");
      err.statusCode = 404;
      throw err;
    }

    const deletedSort = existing.sort_order;

    await existing.destroy({ transaction: t });

    await ClientType.decrement("sort_order", {
      by: 1,
      where: {
        builder_id: builderId,
        sort_order: { [Op.gt]: deletedSort },
      },
      transaction: t,
    });

    return true;
  });
};

// ✅ UPDATE
export const updateClientTypeService = async (id, payload, user) => {
  const { ClientType, sequelize } = db;
  const { client_type, sort_order } = payload;

  return await sequelize.transaction(async (t) => {
    const existing = await ClientType.findOne({
      where: {
        client_type_id: id,
        company_id: user.company_id,
        builder_id: user.builder_id,
      },
      transaction: t,
    });

    if (!existing) {
      throw new Error("Client type not found");
    }
    if (!existing.is_active) {
      throw new Error("Inactive client type");
    }

    if (client_type) {
      const duplicate = await ClientType.findOne({
        where: {
          company_id: user.company_id,
          builder_id: user.builder_id,
          client_type_id: { [Op.ne]: id },
          client_type: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("client_type")),
            client_type.toLowerCase(),
          ),
        },
        transaction: t,
      });

      if (duplicate) {
        throw new Error("Client type already exists");
      }
    }

    if (sort_order !== undefined) {
      const maxSort =
        (await ClientType.max("sort_order", {
          where: {
            [Op.or]: [
              { company_id: user.company_id },
              { builder_id: user.builder_id },
            ],
          },
          transaction: t,
        })) || 0;

      if (sort_order < 1 || sort_order > maxSort) {
        const err = new Error(`sort_order must be between 1 and ${maxSort}`);
        err.statusCode = 400;
        throw err;
      }

      const existingSort = existing.sort_order;

      if (sort_order !== existingSort) {
        if (sort_order > existingSort) {
          await ClientType.decrement("sort_order", {
            by: 1,
            where: {
              builder_id: user.builder_id,
              client_type_id: { [Op.ne]: id },
              sort_order: { [Op.gt]: existingSort, [Op.lte]: sort_order },
            },
            transaction: t,
          });
        } else {
          await ClientType.increment("sort_order", {
            by: 1,
            where: {
              builder_id: user.builder_id,
              client_type_id: { [Op.ne]: id },
              sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSort },
            },
            transaction: t,
          });
        }
      }
    }

    await existing.update(
      {
        ...(client_type !== undefined && { client_type }),
        ...(sort_order !== undefined && { sort_order }),
        updated_by: user.user_id,
      },
      { transaction: t },
    );

    return existing.toJSON();
  });
};

// ✅ UPDATE ACTIVE
export const updateClientTypeActiveService = async (id, is_active, user) => {
  const { ClientType } = db;

  const existing = await ClientType.findOne({
    where: { client_type_id: id, builder_id: user.builder_id },
  });

  if (!existing) {
    throw new Error("Client type not found");
  }

  await existing.update({
    is_active,
    updated_by: user.user_id,
  });

  return existing.toJSON();
};
