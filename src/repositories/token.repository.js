import db from "../config/database/models/postgre-models/index.js";

/**
 * Insert token pair
 * @param {string} userId
 * @param {string} accessToken
 * @param {string} refreshToken
 */
export async function saveTokens(userId, accessToken, refreshToken) {
  await db.UsersToken.create({
    user_id: userId,
    access_token: accessToken,
    refresh_token: refreshToken,
  });
}

/**
 * Invalidate all tokens for a user (on lock)
 * @param {string} userId
 */
export async function invalidateUserSessions(userId) {
  await db.UsersToken.destroy({
    where: { user_id: userId },
  });
}

export default {
  saveTokens,
  invalidateUserSessions,
};
