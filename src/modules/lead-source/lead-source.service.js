import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { adoptSampleRow, isSampleRow } from "../../helper/sampleDataAdoption.helper.js";

// ✅ CREATE
export const createLeadSourceService = async (payload, user) => {
  const { LeadSource, sequelize } = db;
  const { name, sort_order, is_active, allow_change } = payload;

  return await sequelize.transaction(async (t) => {
    const existing = await LeadSource.findOne({
      where: {
        builder_id: user.builder_id,
        name: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("name")),
          name.toLowerCase(),
        ),
      },
      transaction: t,
    });

    if (existing) {
      // A demo row holding the name is not a real clash — the builder is
      // claiming that name, so hand the row over instead of refusing. Keeps its
      // id and sort position; see the helper for why.
      if (isSampleRow(existing)) {
        await adoptSampleRow(
          existing,
          {
            name,
            is_active: is_active ?? true,
            allow_change: allow_change ?? true,
            updated_by: user.users_id,
          },
          t,
        );
        return existing.toJSON();
      }

      const err = new Error("Lead source already exists");
      err.statusCode = 409;
      throw err;
    }

    const maxSort = (await LeadSource.max("sort_order", {
      where: { builder_id: user.builder_id },
      transaction: t,
    })) || 0;

    const finalSort = sort_order ?? 1;

    if (finalSort < 1 || finalSort > maxSort + 1) {
      const err = new Error(`sort_order must be between 1 and ${maxSort + 1}`);
      err.statusCode = 400;
      throw err;
    }

    await LeadSource.increment("sort_order", {
      by: 1,
      where: {
        builder_id: user.builder_id,
        sort_order: { [Op.gte]: finalSort },
      },
      transaction: t,
    });

    const created = await LeadSource.create(
      {
        name,
        company_id: user.company_id,
        builder_id: user.builder_id,
        sort_order: finalSort,
        is_active: is_active ?? true,
        allow_change: allow_change ?? true,
        created_by: user.users_id,
        updated_by: user.users_id,
      },
      { transaction: t },
    );

    return created.toJSON();
  });
};

// ✅ GET ALL (with pagination)
export const getLeadSourcesService = async (builderId, page, limit) => {
  const { LeadSource } = db;

  const offset = (page - 1) * limit;

  const { count, rows } = await LeadSource.findAndCountAll({
    where: { builder_id: builderId },
    order: [["sort_order", "ASC"], ["created_at", "DESC"]],
    limit,
    offset,
  });

  return {
    data: rows.map((r) => r.toJSON()),
    total: count,
  };
};

// ✅ GET BY ID
export const getLeadSourceByIdService = async (id, builderId) => {
  const { LeadSource } = db;

  const data = await LeadSource.findOne({
    where: {
      lead_source_id: id,
      [Op.or]: [{ builder_id: builderId }, { builder_id: null }],
    },
  });

  if (!data) {
    const err = new Error("Lead source not found");
    err.statusCode = 404;
    throw err;
  }

  return data.toJSON();
};

// ✅ UPDATE
export const updateLeadSourceService = async (id, payload, user) => {
  const { LeadSource, sequelize } = db;
  const { name, sort_order, allow_change } = payload;

  return await sequelize.transaction(async (t) => {
    const existing = await LeadSource.findOne({
      where: {
        lead_source_id: id,
        [Op.and]: [
          { [Op.or]: [{ company_id: user.company_id }, { company_id: null }] },
          { [Op.or]: [{ builder_id: user.builder_id }, { builder_id: null }] },
        ],
      },
      transaction: t,
    });

    if (!existing) {
      throw new Error("Lead source not found");
    }

    if (!existing.is_active) {
      throw new Error("Inactive lead source");
    }

    // duplicate name
    if (name) {
      const duplicate = await LeadSource.findOne({
        where: {
          lead_source_id: { [Op.ne]: id },
          builder_id: user.builder_id,
          name: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("name")),
            name.toLowerCase(),
          ),
        },
        transaction: t,
      });

      if (duplicate) {
        if (duplicate.is_sample_data) {
          await duplicate.destroy({ transaction: t });
        } else {
          throw new Error("Name already exists");
        }
      }
    }

    // sort reorder
    if (sort_order !== undefined) {
      const maxSort =
        (await LeadSource.max("sort_order", {
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
          await LeadSource.decrement("sort_order", {
            by: 1,
            where: {
              sort_order: { [Op.gt]: existingSort, [Op.lte]: sort_order },
            },
            transaction: t,
          });
        } else {
          await LeadSource.increment("sort_order", {
            by: 1,
            where: {
              sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSort },
            },
            transaction: t,
          });
        }
      }
    }

    await existing.update(
      {
        ...(name !== undefined && { name }),
        ...(sort_order !== undefined && { sort_order }),
        ...(allow_change !== undefined && { allow_change }),
        updated_by: user.users_id,
      },
      { transaction: t },
    );

    return existing.toJSON();
  });
};

// ✅ DELETE
export const deleteLeadSourceService = async (id, builderId) => {
  const { LeadSource, sequelize } = db;

  return await sequelize.transaction(async (t) => {
    const existing = await LeadSource.findOne({
      where: { lead_source_id: id, builder_id: builderId },
      transaction: t,
    });

    if (!existing) {
      throw new Error("Lead source not found");
    }

    const deletedSort = existing.sort_order;

    await existing.destroy({ transaction: t });

    await LeadSource.decrement("sort_order", {
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

// ✅ UPDATE ACTIVE
export const updateLeadSourceActiveService = async (id, is_active, user) => {
  const { LeadSource } = db;

  const existing = await LeadSource.findOne({
    where: { lead_source_id: id, builder_id: user.builder_id },
  });

  if (!existing) {
    throw new Error("Lead source not found");
  }

  await existing.update({
    is_active,
    updated_by: user.user_id,
  });

  return existing.toJSON();
};
