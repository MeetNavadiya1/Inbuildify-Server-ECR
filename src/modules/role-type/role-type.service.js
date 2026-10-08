import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Fetches role types for a specific role with pagination.
 */
export async function getRoleTypesService(roleId, page = 1, limit = 25) {
  const { Role, RoleType } = db;

  const pageValue = parseInt(page, 10);
  const limitValue = parseInt(limit, 10);
  const offset = (pageValue - 1) * limitValue;

  // 1. Verify role exists
  const roleCheck = await Role.findByPk(roleId);
  if (!roleCheck) {
    return {
      error: { status: 400, message: "Invalid role_id" },
    };
  }

  // 2. Fetch role types
  const { count, rows } = await RoleType.findAndCountAll({
    where: { role_id: roleId },
    order: [["created_at", "DESC"]],
    limit: limitValue,
    offset: offset,
  });

  return {
    data: {
      roleType: keysToCamelCase(rows.map((r) => r.get({ plain: true }))),
      pagination: {
        total: count,
        page: pageValue,
        limit: limitValue,
        totalPages: Math.ceil(count / limitValue),
      },
    },
  };
}

/**
 * Fetches all role types with pagination.
 */
export async function getAllRoleTypesService(page = 1, limit = 25) {
  const { RoleType } = db;

  const pageValue = parseInt(page, 10);
  const limitValue = parseInt(limit, 10);
  const offset = (pageValue - 1) * limitValue;

  const { count, rows } = await RoleType.findAndCountAll({
    order: [["created_at", "DESC"]],
    limit: limitValue,
    offset: offset,
  });

  return {
    data: {
      data: keysToCamelCase(rows.map((r) => r.get({ plain: true }))),
      pagination: {
        total: count,
        page: pageValue,
        limit: limitValue,
        totalPages: Math.ceil(count / limitValue),
      },
    },
  };
}
