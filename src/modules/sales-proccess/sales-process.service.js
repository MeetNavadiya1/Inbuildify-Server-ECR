import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

// ✅ CREATE
export const createSalesProcessService = async (payload, user) => {
  const { SalesProcess, sequelize } = db;

  const { name, is_default } = payload;

  return await sequelize.transaction(async (t) => {
    const existingProcess = await SalesProcess.findOne({
      where: {
        builder_id: user.builder_id,
        name: name.trim(),
      },
      transaction: t,
    });

    if (existingProcess) {
      const error = new Error("Sales process already exists");
      error.statusCode = 400;
      throw error;
    }

    // unset default
    if (is_default) {
      await SalesProcess.update(
        { is_default: false, updated_by: user.user_id },
        {
          where: {
            builder_id: user.builder_id,
            company_id: user.company_id,
          },
          transaction: t,
        },
      );
    }

    const created = await SalesProcess.create(
      {
        company_id: user.company_id,
        builder_id: user.builder_id,
        name: name.trim(),
        is_default: is_default ?? false,
        created_by: user.user_id,
        updated_by: user.user_id,
      },
      { transaction: t },
    );

    return created.toJSON();
  });
};

// ✅ GET ALL
export const getAllSalesProcessService = async (builderId) => {
  const { SalesProcess } = db;

  const result = await SalesProcess.findAll({
    where: { builder_id: builderId },
    order: [["created_at", "ASC"]],
  });

  return result.map((r) => r.toJSON());
};

// ✅ DELETE
export const deleteSalesProcessService = async (id, builderId) => {
  const { SalesProcess } = db;

  const existing = await SalesProcess.findOne({
    where: { sales_process_id: id, builder_id: builderId },
  });

  if (!existing) {
    const error = new Error("Sales process not found");
    error.statusCode = 404;
    throw error;
  }

  await existing.destroy();
  return true;
};

// ✅ UPDATE
export const updateSalesProcessService = async (id, payload, user) => {
  const { SalesProcess, sequelize } = db;

  const { name, is_default } = payload;

  return await sequelize.transaction(async (t) => {
    const existing = await SalesProcess.findOne({
      where: {
        sales_process_id: id,
        builder_id: user.builder_id,
      },
      transaction: t,
    });

    if (!existing) {
      const error = new Error("Sales process not found");
      error.statusCode = 404;
      throw error;
    }

    // duplicate name check
    if (name) {
      const duplicate = await SalesProcess.findOne({
        where: {
          builder_id: user.builder_id,
          sales_process_id: { [Op.ne]: id },
          name: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("name")),
            name.trim().toLowerCase(),
          ),
        },
        transaction: t,
      });

      if (duplicate) {
        const error = new Error("Name already exists");
        error.statusCode = 400;
        throw error;
      }
    }

    // unset default
    if (is_default === true) {
      await SalesProcess.update(
        { is_default: false, updated_by: user.user_id },
        {
          where: {
            builder_id: user.builder_id,
            company_id: user.company_id,
            sales_process_id: { [Op.ne]: id },
          },
          transaction: t,
        },
      );
    }

    await existing.update(
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(is_default !== undefined && { is_default }),
        updated_by: user.user_id,
      },
      { transaction: t },
    );

    return existing.toJSON();
  });
};
