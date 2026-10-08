import bcrypt from "bcrypt";

import db from "../../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../../utils/common.js";
import { signAdminToken } from "../../../middleware/adminAuthMiddleware.js";
import { httpError } from "../admin.helper.js";

const SALT_ROUNDS = 10;

export const hashAdminPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

const shapeAdmin = (platformUser) => ({
  platformUserId: platformUser.platform_user_id,
  name: platformUser.name,
  email: platformUser.email,
  phone: platformUser.phone,
  isActive: platformUser.is_active,
  lastLoginAt: platformUser.last_login_at,
  role: platformUser.platformRole
    ? {
      platformRoleId: platformUser.platformRole.platform_role_id,
      name: platformUser.platformRole.name,
      scope: platformUser.platformRole.scope,
      permissions: platformUser.platformRole.permissions || [],
    }
    : null,
});

export const adminLoginService = async ({ email, password }) => {
  const { PlatformUser, PlatformRole } = db;

  const platformUser = await PlatformUser.scope("withPassword").findOne({
    where: { email: email.toLowerCase().trim() },
    include: [{ model: PlatformRole, as: "platformRole" }],
  });

  if (!platformUser) {
    throw httpError(401, "Invalid email or password.");
  }

  if (!platformUser.is_active) {
    throw httpError(403, "Your admin account has been deactivated.");
  }

  const matches = await bcrypt.compare(password, platformUser.password);

  if (!matches) {
    await platformUser.increment("failed_attempts");
    throw httpError(401, "Invalid email or password.");
  }

  await platformUser.update({ failed_attempts: 0, last_login_at: new Date() });

  return {
    token: signAdminToken(platformUser.platform_user_id),
    admin: keysToCamelCase(shapeAdmin(platformUser)),
  };
};

export const adminProfileService = async ({ platformUserId }) => {
  const { PlatformUser, PlatformRole } = db;

  const platformUser = await PlatformUser.findOne({
    where: { platform_user_id: platformUserId },
    include: [{ model: PlatformRole, as: "platformRole" }],
  });

  if (!platformUser) {
    throw httpError(404, "Platform admin not found.");
  }

  return keysToCamelCase(shapeAdmin(platformUser));
};

export default {
  hashAdminPassword,
  adminLoginService,
  adminProfileService,
};
