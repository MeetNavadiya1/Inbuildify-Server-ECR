import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { keysToCamelCase, encrypt, decrypt } from "../../utils/common.js";

// ============================================================
//        USER PASSWORD HISTORY CRUD OPERATIONS
// ============================================================

export async function createUserPasswordHistory(currentUser, payload) {
  const { UserPasswordHistory, PasswordPolicy } = db;
  const userId = currentUser.user_id;
  const builderId = currentUser.builder_id;

  if (!userId) {
    throw { status: 400, message: "User ID not found in token." };
  }

  const { old_password } = payload;
  if (!old_password) {
    throw { status: 400, message: "Old password is required." };
  }

  const encryptedPassword = encrypt(old_password);

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Check policy
    const policy = await PasswordPolicy.findOne({
      where: { builder_id: builderId, is_active: true },
      transaction
    });

    if (!policy) {
      throw { status: 400, message: "Password policy is inactive or not found for builder." };
    }

    const maxHistory = policy.password_history_count;

    // 2. Check existing history for duplicates
    const existingHistory = await UserPasswordHistory.findAll({
      where: { user_id: userId },
      order: [["changed_at", "ASC"]],
      transaction
    });

    const alreadyUsed = existingHistory.find(x => x.old_password === encryptedPassword);
    if (alreadyUsed) {
      throw { status: 400, message: "This password already exists in your password history." };
    }

    // 3. Manage history limit
    if (existingHistory.length >= maxHistory) {
      const deleteCount = existingHistory.length - (maxHistory - 1);
      const oldestIds = existingHistory.slice(0, deleteCount).map(x => x.history_id);

      await UserPasswordHistory.destroy({
        where: { history_id: { [Op.in]: oldestIds } },
        transaction
      });
    }

    // 4. Create new history entry
    const newHistory = await UserPasswordHistory.create({
      user_id: userId,
      old_password: encryptedPassword
    }, { transaction });

    await transaction.commit();
    return keysToCamelCase(newHistory.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError' || error.code === '23505') {
      throw { status: 400, message: "This password already exists in your password history." };
    }
    throw error;
  }
}

export async function getUserPasswordHistory(currentUser, query = {}) {
  const { UserPasswordHistory } = db;
  const userId = currentUser.user_id;

  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 25;
  const offset = (page - 1) * limit;

  const { rows, count } = await UserPasswordHistory.findAndCountAll({
    where: { user_id: userId },
    order: [["changed_at", "DESC"]],
    limit,
    offset
  });

  const history = rows.map(row => {
    const plain = row.get({ plain: true });
    return {
      ...plain,
      old_password: decrypt(plain.old_password)
    };
  });

  return {
    data: history,
    pagination: {
      total_records: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
      limit
    }
  };
}

export async function getUserPasswordHistoryById(currentUser, id) {
  const { UserPasswordHistory } = db;
  const userId = currentUser.user_id;

  if (!id) {
    throw { status: 400, message: "User password history id is required." };
  }

  const history = await UserPasswordHistory.findOne({
    where: { history_id: id, user_id: userId }
  });

  if (!history) {
    throw { status: 404, message: "Password history not found." };
  }

  const plain = history.get({ plain: true });
  return {
    ...plain,
    old_password: decrypt(plain.old_password)
  };
}

export async function deleteUserPasswordHistory(currentUser, id) {
  const { UserPasswordHistory } = db;
  const userId = currentUser.user_id;

  if (!id) {
    throw { status: 400, message: "Histroy ID is required." };
  }

  const deletedCount = await UserPasswordHistory.destroy({
    where: { history_id: id, user_id: userId }
  });

  if (deletedCount === 0) {
    throw { status: 404, message: "User password history not found for this user." };
  }
}

export async function deleteUserPasswordHistoryByUserId(currentUser, user_id) {
  const { UserPasswordHistory } = db;
  const loggedInUserId = currentUser.user_id;

  if (!loggedInUserId) {
    throw { status: 401, message: "Unauthorized: User not logged in." };
  }

  if (user_id !== loggedInUserId) {
    throw { status: 403, message: "You are not allowed to delete another user's password history." };
  }

  const transaction = await db.sequelize.transaction();

  try {
    const deletedCount = await UserPasswordHistory.destroy({
      where: { user_id },
      transaction
    });

    if (deletedCount === 0) {
      throw { status: 404, message: "No password history found for this user." };
    }

    await transaction.commit();
    return { deletedCount };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export default {
  createUserPasswordHistory,
  getUserPasswordHistory,
  getUserPasswordHistoryById,
  deleteUserPasswordHistory,
  deleteUserPasswordHistoryByUserId
};
