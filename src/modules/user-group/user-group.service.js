import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

/**
 * USER GROUP SERVICE
 */

export async function createUserGroup(currentUser, body) {
  const { UserGroup, Users, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const builderId = currentUser?.builder_id;
    const companyId = currentUser?.company_id;
    const userId = currentUser?.user_id;

    const { name, is_active = true, users_id = [] } = body;

    if (!Array.isArray(users_id)) {
      throw { status: 400, message: "users_id must be an array." };
    }

    // Check if creator is valid
    const user = await Users.findOne({
      where: { users_id: userId, is_deleted: false, is_verified: true },
    });
    if (!user) {
      throw { status: 403, message: "User is not valid or not verify." };
    }

    // Validate users_id array
    if (users_id.length > 0) {
      const usersCount = await Users.count({
        where: {
          users_id,
          is_verified: true,
        },
      });
      if (usersCount !== users_id.length) {
        throw { status: 400, message: "One or more users are inavlid or not verify." };
      }
    }

    // Duplicate check (case-insensitive for same builder)
    const existingGroup = await UserGroup.findOne({
      where: {
        builder_id: builderId,
        is_sample_data: false,
        name: sequelize.where(sequelize.fn("LOWER", sequelize.col("name")), name.trim().toLowerCase()),
      },
    });
    if (existingGroup) {
      throw { status: 400, message: "A user group with this name already exists for this builder." };
    }

    const newGroup = await UserGroup.create({
      company_id: companyId || null,
      builder_id: builderId || null,
      name: name.trim(),
      users_id,
      is_active,
      created_by_id: userId,
      updated_by_id: userId,
    }, { transaction });

    let usersDetails = [];
    if (users_id.length > 0) {
      const users = await Users.findAll({
        where: {
          users_id,
          is_deleted: false,
          is_verified: true,
        },
        attributes: ["users_id", "name"],
      });
      usersDetails = users.map(u => ({ id: u.users_id, name: u.name }));
    }

    await transaction.commit();

    const groupData = newGroup.get({ plain: true });
    return {
      ...keysToCamelCase(groupData),
      id: groupData.user_group_id,
      user_group_id: groupData.user_group_id,
      users: usersDetails,
    };
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

export async function getAllUserGroups(currentUser, query) {
  const { UserGroup, Users } = db;
  const builderId = currentUser?.builder_id;
  const { is_active, search = "", page = 1, limit = 25 } = query;

  const limitValue = parseInt(limit, 10);
  const pageValue = parseInt(page, 10);
  const offset = (pageValue - 1) * limitValue;

  const where = { builder_id: builderId };
  // `is_active` arrives as a real boolean here: the GET route validates the query
  // with getAllUserGroupSchema (Joi.boolean()), which coerces "true"/"false" to a
  // boolean before this runs. Compare against the boolean (string kept as a
  // defensive fallback) — a plain `=== "true"` check was always false, so the
  // Active/Inactive filter never actually filtered.
  if (is_active !== undefined && is_active !== "") {
    where.is_active = is_active === true || is_active === "true";
  }

  if (search) {
    where.name = { [Op.iLike]: `%${search}%` };
  }

  const { count, rows } = await UserGroup.findAndCountAll({
    where,
    limit: limitValue,
    offset,
    order: [["created_at", "DESC"]],
  });

  const userGroupsWithUsers = await Promise.all(rows.map(async (group) => {
    let usersDetails = [];
    if (group.users_id && group.users_id.length > 0) {
      const users = await Users.findAll({
        where: {
          users_id: group.users_id,
          is_deleted: false,
          is_verified: true,
        },
        attributes: ["users_id", "name"],
      });
      usersDetails = users.map(u => ({ id: u.users_id, name: u.name }));
    }

    const groupData = group.get({ plain: true });
    return {
      ...keysToCamelCase(groupData),
      id: groupData.user_group_id,
      user_group_id: groupData.user_group_id,
      users: usersDetails,
    };
  }));

  return {
    userGroups: userGroupsWithUsers,
    pagination: {
      totalRecords: count,
      currentPage: pageValue,
      totalPages: Math.ceil(count / limitValue),
      limit: limitValue,
    },
  };
}

export async function updateUserGroup(currentUser, id, body) {
  const { UserGroup, Users, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const builderId = currentUser.builder_id;
    const userId = currentUser.user_id;
    const { name, is_active, users_id } = body;

    const group = await UserGroup.findOne({
      where: { user_group_id: id, builder_id: builderId },
      transaction,
    });

    if (!group) {
      throw { status: 404, message: "User group not found or not authorized to update." };
    }

    const currentStatus = group.is_active;
    const statusInBody = is_active !== undefined;
    const requestedStatus = is_active;
    const fieldsToCheck = ["name", "users_id"];
    const updatingOtherFields = fieldsToCheck.some(field => body[field] !== undefined);

    // Restrictions based on status
    if (currentStatus === true && statusInBody && requestedStatus === false) {
      if (updatingOtherFields) {
        throw { status: 403, message: "To deactivate an active user group, only 'is_active' is allowed." };
      }
    }

    if (currentStatus === false) {
      const performingActivation = statusInBody && requestedStatus === true;

      if (performingActivation && updatingOtherFields) {
        throw { status: 403, message: "To activate an inactive user group, only 'is_active' is allowed." };
      }

      if (updatingOtherFields && !performingActivation) {
        throw { status: 403, message: "Cannot update fields when the user group is inactive." };
      }

      if (statusInBody && requestedStatus === false) {
        throw { status: 403, message: "User group is already inactive." };
      }
    }

    // Duplicate check
    if (name !== undefined) {
      const dupExist = await UserGroup.findOne({
        where: {
          name: sequelize.where(sequelize.fn("LOWER", sequelize.col("name")), name.trim().toLowerCase()),
          builder_id: builderId,
          is_sample_data: false,
          user_group_id: { [Op.ne]: id },
          is_active: true,
        },
      });

      if (dupExist) {
        throw { status: 400, message: "A user group with this name already exists." };
      }
    }

    // Validate users_id
    if (users_id !== undefined) {
      if (!Array.isArray(users_id)) {
        throw { status: 400, message: "users_id must be an array." };
      }
      if (users_id.length > 0) {
        const usersCount = await Users.count({
          where: {
            users_id,
            is_deleted: false,
            is_verified: true,
          },
        });
        if (usersCount !== users_id.length) {
          throw { status: 400, message: "One or more users are invalid or not verified." };
        }
      }
    }

    const updateData = {};
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (users_id !== undefined) {
      updateData.users_id = users_id;
    }
    if (statusInBody) {
      if (typeof is_active !== "boolean") {
        throw { status: 400, message: "'is_active' must be a boolean value." };
      }
      updateData.is_active = is_active;
    }

    if (Object.keys(updateData).length === 0) {
      throw { status: 400, message: "At least one field is required to update." };
    }

    updateData.updated_by_id = userId;

    await UserGroup.update(updateData, {
      where: { user_group_id: id, builder_id: builderId },
      transaction,
    });

    const updatedGroup = await UserGroup.findByPk(id, { transaction });
    let usersDetails = [];
    if (updatedGroup.users_id && updatedGroup.users_id.length > 0) {
      const users = await Users.findAll({
        where: {
          users_id: updatedGroup.users_id,
          is_deleted: false,
          is_verified: true,
        },
        attributes: ["users_id", "name"],
        transaction,
      });
      usersDetails = users.map(u => ({ id: u.users_id, name: u.name }));
    }

    await transaction.commit();

    const groupData = updatedGroup.get({ plain: true });
    return {
      ...keysToCamelCase(groupData),
      id: groupData.user_group_id,
      user_group_id: groupData.user_group_id,
      users: usersDetails,
    };
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

export async function updateUserGroupIsActive(currentUser, id) {
  const { UserGroup } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;
  const userId = currentUser?.user_id;

  if (!id) {
    throw { status: 400, message: "user_group_id is required" };
  }

  const existing = await UserGroup.findOne({
    where: {
      user_group_id: id,
      [Op.or]: [{ builder_id: builderId || null }, { company_id: companyId || null }],
    },
  });

  if (!existing) {
    throw { status: 404, message: "User group not found" };
  }

  const newIsActive = !existing.is_active;

  await UserGroup.update({
    is_active: newIsActive,
    updated_by_id: userId,
  }, {
    where: { user_group_id: id },
  });

  return { userGroupId: id, isActive: newIsActive };
}

export default {
  createUserGroup,
  getAllUserGroups,
  updateUserGroup,
  updateUserGroupIsActive,
};
