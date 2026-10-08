import jwt from "jsonwebtoken";

import { env } from "../config/env.config.js";
import { errorResponse } from "../helper/response.js";
import db from "../config/database/models/postgre-models/index.js";

export const ADMIN_TOKEN_SCOPE = "platform";

export const adminJwtSecret = () => env.JWT.JWT_ADMIN_SECRET || env.JWT.JWT_SECRET;

export const signAdminToken = (platformUserId) =>
  jwt.sign(
    { platformUserId, scope: ADMIN_TOKEN_SCOPE },
    adminJwtSecret(),
    { expiresIn: env.JWT.JWT_ADMIN_EXPIRATION },
  );

const extractToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const adminAuthMiddleware = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return errorResponse(res, 401, "Unauthorized: Admin token not found.");
    }

    let payload;
    try {
      payload = jwt.verify(token, adminJwtSecret());
    } catch {
      return errorResponse(res, 401, "Unauthorized: Invalid or expired admin token.");
    }

    if (payload?.scope !== ADMIN_TOKEN_SCOPE || !payload?.platformUserId) {
      return errorResponse(res, 401, "Unauthorized: Token is not a platform admin token.");
    }

    const { PlatformUser, PlatformRole } = db;

    const platformUser = await PlatformUser.findOne({
      where: { platform_user_id: payload.platformUserId },
      include: [{ model: PlatformRole, as: "platformRole" }],
    });

    if (!platformUser) {
      return errorResponse(res, 401, "Unauthorized: Platform admin not found.");
    }

    if (!platformUser.is_active) {
      return errorResponse(res, 403, "Your admin account has been deactivated.");
    }

    if (platformUser.platformRole && !platformUser.platformRole.is_active) {
      return errorResponse(res, 403, "Your admin role has been deactivated.");
    }

    req.admin = {
      platform_user_id: platformUser.platform_user_id,
      name: platformUser.name,
      email: platformUser.email,
      platform_role_id: platformUser.platform_role_id,
      role_name: platformUser.platformRole?.name || null,
      permissions: Array.isArray(platformUser.platformRole?.permissions)
        ? platformUser.platformRole.permissions
        : [],
      access_token: token,
    };

    return next();
  } catch (error) {
    console.error("adminAuthMiddleware error:", error);
    return errorResponse(res, 500, "Internal Server Error.");
  }
};

export default adminAuthMiddleware;
