import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

/**
 * Common attributes to include for Color Group retrieval
 */
const getCommonAttributes = () => {
  return {
    include: [
      [
        db.sequelize.literal(`
          EXISTS (
            SELECT 1 FROM color_category cc 
            WHERE "ColorGroup".color_group_id = ANY(cc.color_group)
          ) OR EXISTS (
            SELECT 1 FROM color_group_item_map cgim 
            WHERE cgim.color_group_id = "ColorGroup".color_group_id
          )
        `),
        "isMapped",
      ],
    ],
  };
};

export async function getAllColorGroupsService({ builderId, companyId, status, search }) {
  const where = {
    [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
  };

  if (status !== undefined) {
    where.status = status === "true";
  }

  if (search?.trim()) {
    where.name = { [Op.iLike]: `%${search.trim()}%` };
  }

  const colorGroups = await db.ColorGroup.findAll({
    attributes: getCommonAttributes(),
    where,
    order: [["created_at", "DESC"]],
  });

  return keysToCamelCase(colorGroups.map((cg) => cg.get({ plain: true })));
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getColorGroupByIdService({ colorGroupId, companyId, builderId }) {
  const colorGroup = await db.ColorGroup.findOne({
    attributes: getCommonAttributes(),
    where: {
      color_group_id: colorGroupId,
      [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    },
  });

  if (!colorGroup) {
    const error = new Error("Color group not found.");
    error.status = 404;
    throw error;
  }

  return keysToCamelCase(colorGroup.get({ plain: true }));
}

// ─────────────────────────────────────────────────────────────────────────────

export async function createColorGroupService({ builderId, companyId, userId, name }) {
  const transaction = await db.sequelize.transaction();
  try {
    const trimmedName = name.trim();

    // Check for duplicate name
    const duplicate = await db.ColorGroup.findOne({
      where: {
        company_id: companyId,
        builder_id: builderId,
        is_sample_data: false,
        name: { [Op.iLike]: trimmedName },
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("Color group with this name already exists.");
      error.status = 409;
      throw error;
    }

    const createdColorGroup = await db.ColorGroup.create(
      {
        company_id: companyId,
        builder_id: builderId,
        name: trimmedName,
        status: true,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();
    return {
      ...keysToCamelCase(createdColorGroup.get({ plain: true })),
      isMapped: false,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function updateColorGroupService({
  colorGroupId,
  companyId,
  builderId,
  userId,
  name,
  status,
}) {
  const transaction = await db.sequelize.transaction();
  try {
    const colorGroup = await db.ColorGroup.findOne({
      where: {
        color_group_id: colorGroupId,
        company_id: companyId,
        builder_id: builderId,
      },
      transaction,
    });

    if (!colorGroup) {
      const error = new Error("Color group not found.");
      error.status = 404;
      throw error;
    }

    if (name && name.trim().toLowerCase() !== colorGroup.name.toLowerCase()) {
      const duplicate = await db.ColorGroup.findOne({
        where: {
          company_id: companyId,
          builder_id: builderId,
          is_sample_data: false,
          name: { [Op.iLike]: name.trim() },
          color_group_id: { [Op.ne]: colorGroupId },
        },
        transaction,
      });

      if (duplicate) {
        const error = new Error("Color group name already exists.");
        error.status = 400; // Original logic returns 400 here
        throw error;
      }
    }

    const updateData = {
      updated_by: userId,
    };

    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (status !== undefined) {
      if (typeof status !== "boolean") {
        const error = new Error("Status must be a boolean value.");
        error.status = 400;
        throw error;
      }
      updateData.status = status;
    }

    await colorGroup.update(updateData, { transaction });

    // Fetch updated record with isMapped attribute
    const updatedRecord = await db.ColorGroup.findOne({
      attributes: getCommonAttributes(),
      where: { color_group_id: colorGroupId },
      transaction,
    });

    await transaction.commit();
    return keysToCamelCase(updatedRecord.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function deleteColorGroupService({ colorGroupId, companyId, builderId }) {
  const transaction = await db.sequelize.transaction();
  try {
    const colorGroup = await db.ColorGroup.findOne({
      where: {
        color_group_id: colorGroupId,
        company_id: companyId,
        builder_id: builderId,
      },
      transaction,
    });

    if (!colorGroup) {
      const error = new Error("Color group not found.");
      error.status = 404;
      throw error;
    }

    // Original SQL: UPDATE color_category SET color_group = array_remove(color_group, $1) WHERE $1 = ANY(color_group)
    await db.ColorCategory.update(
      {
        color_group: db.sequelize.fn("array_remove", db.sequelize.col("color_group"), colorGroupId),
      },
      {
        where: {
          color_group: { [Op.contains]: [colorGroupId] },
        },
        transaction,
      },
    );

    await colorGroup.destroy({ transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

