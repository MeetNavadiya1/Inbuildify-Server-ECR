import { Op, literal } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import { adoptSampleRow, isSampleRow } from "../../helper/sampleDataAdoption.helper.js";

/**
 * Validates and parses user_id input (array, string, JSON string, or comma-separated string)
 */
function parseUserId(user_id) {
  let userIdArray = [];
  if (user_id) {
    if (Array.isArray(user_id)) {
      userIdArray = user_id;
    } else if (typeof user_id === "string") {
      try {
        if (user_id.trim().startsWith("[")) {
          userIdArray = JSON.parse(user_id);
        } else if (user_id.startsWith("{") && user_id.endsWith("}")) {
          userIdArray = [user_id.replace(/[{}"]/g, "")];
        } else {
          userIdArray = user_id.split(",").map((x) => x.trim());
        }
      } catch (e) {
        throw new Error("Invalid user_id format.");
      }
    }
  }
  return userIdArray.length === 0 ? null : userIdArray;
}

/**
 * Validates user IDs existence in the database
 */
async function validateUserIds(userIdArray, transaction) {
  if (userIdArray && userIdArray.length > 0) {
    const validUsers = await db.Users.count({
      where: {
        users_id: { [Op.in]: userIdArray },
        is_deleted: false,
      },
      transaction,
    });
    if (validUsers !== userIdArray.length) {
      throw new Error("One or more user IDs are invalid.");
    }
  }
}

export async function getAllRangesService(builderId) {
  return await db.Range.findAll({
    where: { builder_id: builderId },
    order: [["sort_order", "ASC"]],
  });
}

export async function createRangeService(payload, user, files) {
  const t = await db.sequelize.transaction();
  try {
    const { builder_id: builderId, company_id: companyId, user_id: requestUserId } = user;
    const { name, user_id, sort_order, bg_color, font_color, is_active } = payload;
    const logo_image = files?.logoUrl?.[0]?.location || null;
    const header_image = files?.headerUrl?.[0]?.location || null;

    if (!builderId) {
      const error = new Error("Unauthorized: Missing builder ID.");
      error.statusCode = 401;
      throw error;
    }

    const userIdArray = parseUserId(user_id);
    await validateUserIds(userIdArray, t);

    // Duplicate name check
    const dupCheck = await db.Range.findOne({
      where: {
        builder_id: builderId,
        [Op.and]: literal(`LOWER(name) = LOWER('${name.replace(/'/g, "''")}')`),
      },
      transaction: t,
    });
    if (dupCheck) {
      // A demo row holding the name is not a real clash — the builder is
      // claiming that name, so hand the row over instead of refusing. Keeps its
      // id and sort position; see the helper for why.
      if (isSampleRow(dupCheck)) {
        await adoptSampleRow(
          dupCheck,
          {
            name,
            ...(logo_image ? { logo_url: logo_image } : {}),
            ...(header_image ? { header_url: header_image } : {}),
            ...(userIdArray?.length ? { user_id: userIdArray } : {}),
            ...(bg_color ? { bg_color } : {}),
            ...(font_color ? { font_color } : {}),
            is_active: is_active ?? true,
            updated_by: requestUserId,
          },
          t,
        );
        await t.commit();
        return dupCheck;
      }

      const error = new Error("Range name already exists.");
      error.statusCode = 400;
      throw error;
    }

    // Determine sort_order
    const finalSortOrder = sort_order ?? 1;
    const maxSortOrder = (await db.Range.max("sort_order", {
      where: { builder_id: builderId },
      transaction: t,
    })) ?? 0;

    if (finalSortOrder < 1 || finalSortOrder > maxSortOrder + 1) {
      const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`);
      error.statusCode = 400;
      throw error;
    }

    // Shift existing sort_orders up
    await db.Range.increment("sort_order", {
      by: 1,
      where: {
        sort_order: { [Op.gte]: finalSortOrder },
        builder_id: builderId,
      },
      transaction: t,
    });

    const newRange = await db.Range.create({
      company_id: companyId,
      builder_id: builderId,
      name,
      logo_url: logo_image,
      header_url: header_image,
      user_id: userIdArray,
      sort_order: finalSortOrder,
      bg_color: bg_color || null,
      font_color: font_color || null,
      is_active: is_active ?? true,
      created_by: requestUserId,
      updated_by: requestUserId,
    }, { transaction: t });

    await t.commit();
    return newRange;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

export async function updateRangeService(rangeId, payload, user, files) {
  const t = await db.sequelize.transaction();
  try {
    const builderId = user?.builder_id;
    const userId = user?.user_id;

    if (!builderId) {
      const error = new Error("Unauthorized: Builder ID missing.");
      error.statusCode = 401;
      throw error;
    }

    const { name, user_id, sort_order, bg_color, font_color } = payload;
    const logo_image = files?.logoUrl?.[0]?.location || payload.logo_url;
    const header_image = files?.headerUrl?.[0]?.location || payload.header_url;

    const existingRange = await db.Range.findOne({
      where: { range_id: rangeId, builder_id: builderId },
      transaction: t,
    });

    if (!existingRange) {
      const error = new Error("Range not found for this builder.");
      error.statusCode = 404;
      throw error;
    }

    if (!existingRange.is_active) {
      const error = new Error("Inactive range.");
      error.statusCode = 404;
      throw error;
    }

    const userIdArray = parseUserId(user_id);
    await validateUserIds(userIdArray, t);

    if (name) {
      const dupName = await db.Range.findOne({
        where: {
          builder_id: builderId,
          range_id: { [Op.ne]: rangeId },
          is_sample_data: false,
          [Op.and]: literal(`LOWER(name) = LOWER('${name.trim().replace(/'/g, "''")}')`),
        },
        transaction: t,
      });
      if (dupName) {
        const error = new Error("Range name already exists.");
        error.statusCode = 400;
        throw error;
      }
    }

    const existingSortOrder = existingRange.sort_order;
    if (sort_order !== undefined && sort_order !== null) {
      const maxSortOrder = (await db.Range.max("sort_order", {
        where: { builder_id: builderId },
        transaction: t,
      })) ?? 0;

      if (sort_order < 1 || sort_order > maxSortOrder) {
        const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder}.`);
        error.statusCode = 400;
        throw error;
      }

      if (sort_order !== existingSortOrder) {
        if (sort_order > existingSortOrder) {
          await db.Range.decrement("sort_order", {
            by: 1,
            where: {
              sort_order: { [Op.gt]: existingSortOrder, [Op.lte]: sort_order },
              range_id: { [Op.ne]: rangeId },
              builder_id: builderId,
            },
            transaction: t,
          });
        } else {
          await db.Range.increment("sort_order", {
            by: 1,
            where: {
              sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSortOrder },
              range_id: { [Op.ne]: rangeId },
              builder_id: builderId,
            },
            transaction: t,
          });
        }
      }
    }

    const updatePayload = { updated_by: userId, updatedAt: new Date() };
    if (name) {
      updatePayload.name = name.trim();
    }
    if (user_id !== undefined) {
      updatePayload.user_id = userIdArray;
    }
    if (sort_order !== undefined) {
      updatePayload.sort_order = sort_order;
    }
    if (bg_color !== undefined) {
      updatePayload.bg_color = bg_color;
    }
    if (font_color !== undefined) {
      updatePayload.font_color = font_color;
    }

    if (logo_image !== undefined) {
      if (!logo_image) {
        updatePayload.logo_url = null;
      } else {
        if (existingRange.logo_url && existingRange.logo_url !== logo_image) {
          await deleteFromS3(existingRange.logo_url);
        }
        updatePayload.logo_url = logo_image;
      }
    }

    if (header_image !== undefined) {
      if (!header_image) {
        updatePayload.header_url = null;
      } else {
        if (existingRange.header_url && existingRange.header_url !== header_image) {
          await deleteFromS3(existingRange.header_url);
        }
        updatePayload.header_url = header_image;
      }
    }

    if (Object.keys(updatePayload).length <= 2) {
      const error = new Error("No fields provided to update.");
      error.statusCode = 400;
      throw error;
    }

    await existingRange.update(updatePayload, { transaction: t });
    await t.commit();
    return existingRange;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

export async function deleteRangeService(rangeId, builderId) {
  const t = await db.sequelize.transaction();
  try {
    const existingRange = await db.Range.findOne({
      where: { range_id: rangeId, builder_id: builderId },
      transaction: t,
    });

    if (!existingRange) {
      const error = new Error("Range not found for this builder");
      error.statusCode = 404;
      throw error;
    }

    const deletedSortOrder = existingRange.sort_order;

    await db.PriceListItem.update(
      { range_id: literal(`array_remove(range_id, '${rangeId}'::uuid)`) },
      { where: literal(`'${rangeId}'::uuid = ANY(range_id)`), transaction: t },
    );

    await db.Package.update(
      { range_id: literal(`array_remove(range_id, '${rangeId}'::uuid)`) },
      { where: literal(`'${rangeId}'::uuid = ANY(range_id)`), transaction: t },
    );

    await existingRange.destroy({ transaction: t });

    await db.Range.decrement("sort_order", {
      by: 1,
      where: {
        sort_order: { [Op.gt]: deletedSortOrder },
        builder_id: builderId,
      },
      transaction: t,
    });

    await t.commit();
    return existingRange;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function updateRangeActiveService(rangeId, builderId, userId, is_active) {
  const existingRange = await db.Range.findOne({
    where: { range_id: rangeId, builder_id: builderId },
  });

  if (!existingRange) {
    const error = new Error("range not found for this builder");
    error.statusCode = 404;
    throw error;
  }

  await existingRange.update({
    is_active,
    updated_by: userId,
    updatedAt: new Date(),
  });

  return existingRange;
}

export default {
  getAllRangesService,
  createRangeService,
  updateRangeService,
  deleteRangeService,
  updateRangeActiveService,
};
