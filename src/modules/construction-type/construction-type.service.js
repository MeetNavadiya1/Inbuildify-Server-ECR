import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

export async function createConstructionTypeService({
  builderId,
  companyId,
  userId,
  builder,
  types_name,
  start_construction_days,
  sort_order,
  dwelling_type,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Validate builder if provided ───────────────────────────────────────
    if (builder) {
      const builderExists = await db.Builder.findOne({
        where: { builder_id: builder },
        attributes: ["builder_id"],
        transaction,
      });

      if (!builderExists) {
        const error = new Error("Invalid builder ID.");
        error.status = 400;
        throw error;
      }
    }

    // ── 2. Check duplicate types_name ─────────────────────────────────────────
    const duplicate = await db.ConstructionType.findOne({
      where: {
        types_name,
        [db.Sequelize.Op.or]: [
          ...(companyId ? [{ company_id: companyId }] : []),
          ...(builderId ? [{ builder_id: builderId }] : []),
        ],
      },
      attributes: ["construction_type_id"],
      transaction,
    });

    if (duplicate) {
      const error = new Error("Construction type with this name already exists.");
      error.status = 409;
      throw error;
    }

    // ── 3. Resolve and validate sort_order ────────────────────────────────────
    if (sort_order == null) {
      sort_order = 1;
    }

    const maxSortOrder = await db.ConstructionType.max("sort_order", {
      where: {
        [db.Sequelize.Op.or]: [
          ...(companyId ? [{ company_id: companyId }] : []),
          ...(builderId ? [{ builder_id: builderId }] : []),
        ],
      },
      transaction,
    });

    const max = maxSortOrder ?? 0;

    if (sort_order < 1 || sort_order > max + 1) {
      const error = new Error(`Invalid sort_order. Allowed range is 1 to ${max + 1}.`);
      error.status = 400;
      throw error;
    }

    // ── 4. Validate dwelling_type IDs BEFORE shifting sort_order ──────────────
    if (dwelling_type.length > 0) {
      const validDwellings = await db.DwellingType.findAll({
        where: {
          dwelling_type_id: { [db.Sequelize.Op.in]: dwelling_type },
          builder_id: builderId,
          is_active: true,
        },
        attributes: ["dwelling_type_id"],
        transaction,
      });

      if (validDwellings.length !== dwelling_type.length) {
        const error = new Error("One or more dwelling_type IDs are invalid or inactive.");
        error.status = 400;
        throw error;
      }
    }

    // ── 5. Shift existing sort orders (after all validations pass) ────────────
    await db.ConstructionType.increment("sort_order", {
      by: 1,
      where: {
        sort_order: { [db.Sequelize.Op.gte]: sort_order },
        [db.Sequelize.Op.or]: [
          ...(companyId ? [{ company_id: companyId }] : []),
          ...(builderId ? [{ builder_id: builderId }] : []),
        ],
      },
      transaction,
    });

    // ── 6. Insert new construction type ───────────────────────────────────────
    const newType = await db.ConstructionType.create(
      {
        company_id: companyId,
        builder_id: builderId,
        builder: builder || null,
        types_name,
        start_construction_days,
        sort_order,
        dwelling_type,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    // ── 7. Fetch builder info ─────────────────────────────────────────────────
    let builderInfo = null;
    if (builder) {
      const builderRecord = await db.Builder.findOne({
        where: { builder_id: builder },
        attributes: [["builder_id", "id"], "name"],
        transaction,
      });
      builderInfo = builderRecord ? builderRecord.toJSON() : null;
    }

    // ── 8. Fetch dwelling_type details ────────────────────────────────────────
    let dwellingDetails = [];
    if (dwelling_type.length > 0) {
      const dwellings = await db.DwellingType.findAll({
        where: { dwelling_type_id: { [db.Sequelize.Op.in]: dwelling_type } },
        attributes: [["dwelling_type_id", "id"], "name"],
        transaction,
      });
      dwellingDetails = dwellings.map((d) => d.toJSON());
    }

    await transaction.commit();

    // ── 9. Return response matching original shape ────────────────────────────
    return keysToCamelCase({
      construction_type_id: newType.construction_type_id,
      types_name: newType.types_name,
      sort_order: newType.sort_order,
      start_construction_days: newType.start_construction_days,
      builder: builderInfo,
      dwelling_type: dwellingDetails,
    });

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getAllConstructionTypesService({ loggedInBuilderId, builder }) {
  const whereClause = builder
    ? { builder, builder_id: loggedInBuilderId }
    : { builder_id: loggedInBuilderId };

  const constructionTypes = await db.ConstructionType.findAll({
    where: whereClause,
    attributes: [
      "construction_type_id",
      "types_name",
      "sort_order",
      "start_construction_days",
      "created_at",
      "dwelling_type",
    ],
    include: [
      {
        model: db.Builder,
        as: "builderRef",
        attributes: [["builder_id", "id"], "name"],
        required: true,
      },
    ],
    order: [
      ["sort_order", "ASC"],
      ["created_at", "DESC"],
    ],
  });

  const result = await Promise.all(
    constructionTypes.map(async (ct) => {
      const plain = ct.toJSON();

      let dwellingDetails = [];
      if (plain.dwelling_type && plain.dwelling_type.length > 0) {
        const dwellings = await db.DwellingType.findAll({
          where: {
            dwelling_type_id: { [db.Sequelize.Op.in]: plain.dwelling_type },
          },
          attributes: [["dwelling_type_id", "id"], "name"],
        });
        dwellingDetails = dwellings.map((d) => d.toJSON());
      }

      return {
        construction_type_id: plain.construction_type_id,
        types_name: plain.types_name,
        sort_order: plain.sort_order,
        start_construction_days: plain.start_construction_days,
        created_at: plain.created_at,
        builder: plain.builderRef ?? null,
        dwelling_type: dwellingDetails,
      };
    }),
  );

  return result;
}

export async function updateConstructionTypeService({
  builderId,
  companyId,
  userId,
  construction_type_id,
  types_name,
  start_construction_days,
  sort_order,
  dwelling_type,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check record exists for this builder ───────────────────────────────
    const existing = await db.ConstructionType.findOne({
      where: { construction_type_id, builder_id: builderId },
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction type not found or access denied.");
      error.status = 404;
      throw error;
    }

    const existingSortOrder = existing.sort_order;

    // ── 2. Check duplicate types_name (excluding current record) ──────────────
    if (types_name) {
      const duplicate = await db.ConstructionType.findOne({
        where: {
          types_name,
          construction_type_id: { [db.Sequelize.Op.ne]: construction_type_id },
          [db.Sequelize.Op.or]: [
            ...(companyId ? [{ company_id: companyId }] : []),
            ...(builderId ? [{ builder_id: builderId }] : []),
          ],
        },
        attributes: ["construction_type_id"],
        transaction,
      });

      if (duplicate) {
        const error = new Error("Construction type with this name already exists.");
        error.status = 409;
        throw error;
      }
    }

    // ── 3. Validate and reorder sort_order if changed ─────────────────────────
    if (sort_order !== undefined && sort_order !== null) {
      const maxSortOrder = await db.ConstructionType.max("sort_order", {
        where: {
          [db.Sequelize.Op.or]: [
            ...(companyId ? [{ company_id: companyId }] : []),
            ...(builderId ? [{ builder_id: builderId }] : []),
          ],
        },
        transaction,
      });

      const max = maxSortOrder ?? 0;

      if (sort_order < 1 || sort_order > max) {
        const error = new Error(`Invalid sort_order. Allowed range is 1 to ${max}.`);
        error.status = 400;
        throw error;
      }

      if (sort_order !== existingSortOrder) {
        if (sort_order > existingSortOrder) {
          // Moving down — shift records between old and new position up
          await db.ConstructionType.increment("sort_order", {
            by: -1,
            where: {
              sort_order: {
                [db.Sequelize.Op.gt]: existingSortOrder,
                [db.Sequelize.Op.lte]: sort_order,
              },
              construction_type_id: { [db.Sequelize.Op.ne]: construction_type_id },
              [db.Sequelize.Op.or]: [
                ...(companyId ? [{ company_id: companyId }] : []),
                ...(builderId ? [{ builder_id: builderId }] : []),
              ],
            },
            transaction,
          });
        } else {
          // Moving up — shift records between new and old position down
          await db.ConstructionType.increment("sort_order", {
            by: 1,
            where: {
              sort_order: {
                [db.Sequelize.Op.gte]: sort_order,
                [db.Sequelize.Op.lt]: existingSortOrder,
              },
              construction_type_id: { [db.Sequelize.Op.ne]: construction_type_id },
              [db.Sequelize.Op.or]: [
                ...(companyId ? [{ company_id: companyId }] : []),
                ...(builderId ? [{ builder_id: builderId }] : []),
              ],
            },
            transaction,
          });
        }
      }
    }

    // ── 4. Validate dwelling_type IDs are active ──────────────────────────────
    if (dwelling_type && dwelling_type.length > 0) {
      const validDwellings = await db.DwellingType.findAll({
        where: {
          dwelling_type_id: { [db.Sequelize.Op.in]: dwelling_type },
          builder_id: builderId,
          is_active: true,
        },
        attributes: ["dwelling_type_id"],
        transaction,
      });

      if (validDwellings.length !== dwelling_type.length) {
        const error = new Error("One or more dwelling_type IDs are invalid or inactive.");
        error.status = 400;
        throw error;
      }
    }

    // ── 5. Build update payload ───────────────────────────────────────────────
    const updatePayload = { updated_by: userId };
    if (types_name !== undefined) {
      updatePayload.types_name = types_name;
    }
    if (start_construction_days !== undefined) {
      updatePayload.start_construction_days = start_construction_days;
    }
    if (sort_order !== undefined) {
      updatePayload.sort_order = sort_order;
    }
    if (dwelling_type !== undefined) {
      updatePayload.dwelling_type = dwelling_type;
    }

    await existing.update(updatePayload, { transaction });

    // ── 6. Fetch full response with builder and dwelling_type details ──────────
    const fullRecord = await db.ConstructionType.findOne({
      where: { construction_type_id },
      attributes: [
        "construction_type_id",
        "types_name",
        "sort_order",
        "start_construction_days",
        "dwelling_type",
      ],
      include: [
        {
          model: db.Builder,
          as: "builderRef",
          attributes: [["builder_id", "id"], "name"],
          required: true,
        },
      ],
      transaction,
    });

    // ── 7. Fetch dwelling_type details ────────────────────────────────────────
    const plain = fullRecord.toJSON();
    let dwellingDetails = [];
    if (plain.dwelling_type && plain.dwelling_type.length > 0) {
      const dwellings = await db.DwellingType.findAll({
        where: { dwelling_type_id: { [db.Sequelize.Op.in]: plain.dwelling_type } },
        attributes: [["dwelling_type_id", "id"], "name"],
        transaction,
      });
      dwellingDetails = dwellings.map((d) => d.toJSON());
    }

    await transaction.commit();

    return {
      construction_type_id: plain.construction_type_id,
      types_name: plain.types_name,
      sort_order: plain.sort_order,
      start_construction_days: plain.start_construction_days,
      builder: plain.builderRef ?? null, // ✅ builderRef → builder
      dwelling_type: dwellingDetails,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteConstructionTypeService({ builderId, construction_type_id }) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check record exists for this builder ───────────────────────────────
    const existing = await db.ConstructionType.findOne({
      where: { construction_type_id, builder_id: builderId },
      attributes: ["construction_type_id", "sort_order"],
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction type not found or access denied.");
      error.status = 404;
      throw error;
    }

    const deletedSortOrder = existing.sort_order;

    // ── 2. Delete the record ──────────────────────────────────────────────────
    await existing.destroy({ transaction });

    // ── 3. Shift sort_order down for all records above deleted position ────────
    await db.ConstructionType.increment("sort_order", {
      by: -1,
      where: {
        builder_id: builderId,
        sort_order: { [db.Sequelize.Op.gt]: deletedSortOrder },
      },
      transaction,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
