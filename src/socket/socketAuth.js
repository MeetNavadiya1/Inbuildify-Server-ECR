import jwt from "jsonwebtoken";

import { env } from "../config/env.config.js";
import authService from "../modules/auth/auth.service.js";
import { getRoleNameById } from "../helper/rbac.helper.js";
import { canViewSampleData } from "../constants/rbac.js";
import {
  runAsSampleDataViewer,
  runWithoutSampleData,
} from "../config/database/models/postgre-models/sampleDataFlag.js";

/**
 * Rebuilds `req.user` the way authMiddleware does, or throws: signature, a live
 * users_token row (so logging out revokes it), an active and verified user,
 * and a builder/company link.
 */
export async function authenticateToken(token) {
  if (!token || typeof token !== "string") {
    throw new Error("unauthorized");
  }

  const payload = jwt.verify(token, env.JWT.JWT_SECRET);
  if (!payload?.userId) {
    throw new Error("unauthorized");
  }

  const user = await authService.validateTokenAndUser(token, payload.userId);
  if (!user || (!user.builder_id && !user.company_id)) {
    throw new Error("unauthorized");
  }

  user.user_id = user.users_id;
  user.id = user.users_id;

  if (!user.company_id && user.builder_id) {
    const company = await authService.getCompanyByBuilderId(user.builder_id);
    if (company) {
      user.company_id = company.company_id;
    }
  }
  if (!user.company_id) {
    throw new Error("unauthorized");
  }

  user.role_name = await getRoleNameById(user.role_id);
  if (!user.role_name) {
    throw new Error("unauthorized");
  }
  user.sees_sample_data = canViewSampleData(user, user.role_name);

  return user;
}

/**
 * Runs `fn` in the same sample-data context authMiddleware sets for a request,
 * so model reads inside a socket handler see exactly what the REST API would.
 */
export function withUserContext(user, fn) {
  return runAsSampleDataViewer(user.users_id, () =>
    user.sees_sample_data ? fn() : runWithoutSampleData(fn),
  );
}
