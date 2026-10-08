import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

export async function createUserRoleMappingService({
  builderId,
  companyId,
  role_id,
  role_type_id,
  user_id,
  assigned_by,
}) {
  // ── Validate role_id ────────────────────────────────────────────────────────
  const validRole = await db.Role.findOne({
    where: { role_id },
    attributes: ["role_id"],
  });

  if (!validRole) {
    const error = new Error("No role found.");
    error.status = 404;
    throw error;
  }

  // ── Validate role_type_id (must belong to the role) ─────────────────────────
  if (role_type_id) {
    const validRoleType = await db.RoleType.findOne({
      where: { role_type_id, role_id },
      attributes: ["role_type_id"],
    });

    if (!validRoleType) {
      const error = new Error("Invalid role_type_id or role_type not linked to this role.");
      error.status = 400;
      throw error;
    }
  }

  // ── Validate user_id ────────────────────────────────────────────────────────
  if (user_id) {
    const validUser = await db.Users.findOne({
      where: { users_id: user_id, is_deleted: false },
      attributes: ["users_id"],
    });

    if (!validUser) {
      const error = new Error("No user found.");
      error.status = 404;
      throw error;
    }
  }

  // ── Duplicate mapping check ─────────────────────────────────────────────────
  const duplicate = await db.UserRoleMapping.findOne({
    where: {
      role_id,
      builder_id: builderId,
      user_id: user_id ?? null,
      role_type_id: role_type_id ?? null,
    },
    attributes: ["user_role_mapping_id"],
  });

  if (duplicate) {
    const error = new Error("This role mapping already exists.");
    error.status = 409;
    throw error;
  }

  // ── Insert mapping ──────────────────────────────────────────────────────────
  const newMapping = await db.UserRoleMapping.create({
    company_id: companyId,
    builder_id: builderId,
    user_id, // column: user_id  ✅
    role_id,
    role_type_id,
    assigned_by,
  });

  // ── Fetch full response with joins ──────────────────────────────────────────
  // Note: UserRoleMapping.belongsTo(Users, { foreignKey: "user_id", as: "user" })
  //       Make sure this is set correctly in your model associations
  const mapping = await db.UserRoleMapping.findOne({
    where: { user_role_mapping_id: newMapping.user_role_mapping_id },
    attributes: ["user_role_mapping_id", "assigned_at"],
    include: [
      {
        model: db.Users,
        as: "user",
        attributes: [["users_id", "id"], "name"],
        required: false,
      },
      {
        model: db.Role,
        as: "role",
        attributes: [["role_id", "id"], "name"],
        required: false,
      },
      {
        model: db.RoleType,
        as: "roleType",
        attributes: [["role_type_id", "id"], ["type_name", "name"]],
        required: false,
      },
    ],
  });

  const plain = mapping.toJSON();

  return {
    userRoleMappingId: plain.user_role_mapping_id,
    user: plain.user ?? null,
    role: plain.role ?? null,
    roleType: plain.roleType ?? null,
    assignedBy: assigned_by || null,
    assignedAt: plain.assigned_at,
  };
}

export async function getAllUserRoleMappingService({ builderId, page, limit, assignedBy }) {
  const offset = (page - 1) * limit;

  // ── Build where clause ──────────────────────────────────────────────────────
  const where = { builder_id: builderId };
  if (assignedBy) {
    where.assigned_by = assignedBy;
  }

  // ── Fetch data + count ──────────────────────────────────────────────────────
  const { rows: mappings, count: total } = await db.UserRoleMapping.findAndCountAll({
    where,
    attributes: ["user_role_mapping_id", "user_id", "role_id", "role_type_id", "assigned_by", "assigned_at"],
    include: [
      {
        model: db.Users,
        as: "user",
        attributes: [["users_id", "id"], "name"],
        required: false,
      },
      {
        model: db.Role,
        as: "role",
        attributes: [["role_id", "id"], "name"],
        required: false,
      },
      {
        model: db.RoleType,
        as: "roleType",
        attributes: [["role_type_id", "id"], ["type_name", "name"]],
        required: false,
      },
    ],
    order: [["assigned_at", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  const totalPages = Math.ceil(total / limit);

  // ── Format response to match original shape ─────────────────────────────────
  const userRoleMapping = mappings.map((m) => {
    const plain = m.toJSON();
    return {
      userRoleMappingId: plain.user_role_mapping_id,
      user: plain.user ?? null,
      role: plain.role ?? null,
      roleType: plain.roleType ?? null,
      assignedBy: plain.assigned_by
        ? { id: plain.assigned_by }
        : null,
      assignedAt: plain.assigned_at,
    };
  });

  return {
    userRoleMapping,
    records: total,
    currentPage: page,
    limit,
    totalPages,
  };
}

export async function updateUserRoleMappingService({ userRoleMappingId, builderId, companyId, payload }) {
  const { user_id, role_id, role_type_id, assigned_by } = payload;

  // ── Check mapping exists for this builder ───────────────────────────────────
  const existing = await db.UserRoleMapping.findOne({
    where: { user_role_mapping_id: userRoleMappingId, builder_id: builderId },
  });

  if (!existing) {
    const error = new Error("User role mapping not found.");
    error.status = 404;
    throw error;
  }

  // ── Resolve final values (fallback to existing if not provided) ─────────────
  const finalUserId = user_id !== undefined ? user_id : existing.user_id;
  const finalRoleId = role_id !== undefined ? role_id : existing.role_id;
  const finalRoleTypeId = role_type_id !== undefined ? role_type_id : existing.role_type_id;
  const finalAssignedBy = assigned_by !== undefined ? assigned_by : existing.assigned_by;

  // ── Validate role_id ────────────────────────────────────────────────────────
  if (role_id !== undefined) {
    const validRole = await db.Role.findOne({
      where: { role_id: finalRoleId },
      attributes: ["role_id"],
    });

    if (!validRole) {
      const error = new Error("No role found.");
      error.status = 404;
      throw error;
    }
  }

  // ── Validate role_type_id (must belong to the role) ─────────────────────────
  if (finalRoleTypeId) {
    const validRoleType = await db.RoleType.findOne({
      where: { role_type_id: finalRoleTypeId, role_id: finalRoleId },
      attributes: ["role_type_id"],
    });

    if (!validRoleType) {
      const error = new Error("Invalid role_type_id or role_type not accessible for this role.");
      error.status = 400;
      throw error;
    }
  }

  // ── Validate user_id ────────────────────────────────────────────────────────
  if (user_id !== undefined && finalUserId !== null) {
    const validUser = await db.Users.findOne({
      where: { users_id: finalUserId, is_deleted: false },
      attributes: ["users_id"],
    });

    if (!validUser) {
      const error = new Error("No user found.");
      error.status = 404;
      throw error;
    }
  }

  // ── Duplicate mapping check ─────────────────────────────────────────────────
  const duplicate = await db.UserRoleMapping.findOne({
    where: {
      role_id: finalRoleId,
      builder_id: builderId,
      user_id: finalUserId ?? null,
      role_type_id: finalRoleTypeId ?? null,
      user_role_mapping_id: { [Op.ne]: userRoleMappingId },
    },
    attributes: ["user_role_mapping_id"],
  });

  if (duplicate) {
    const error = new Error("This role mapping already exists.");
    error.status = 409;
    throw error;
  }

  // ── Update mapping ──────────────────────────────────────────────────────────
  await db.UserRoleMapping.update(
    {
      user_id: finalUserId,
      role_id: finalRoleId,
      role_type_id: finalRoleTypeId,
      assigned_by: finalAssignedBy,
      company_id: companyId,
    },
    { where: { user_role_mapping_id: userRoleMappingId } },
  );

  // ── Fetch updated record with joins ─────────────────────────────────────────
  const mapping = await db.UserRoleMapping.findOne({
    where: { user_role_mapping_id: userRoleMappingId },
    attributes: ["user_role_mapping_id", "assigned_by", "assigned_at"],
    include: [
      {
        model: db.Users,
        as: "user",
        attributes: [["users_id", "id"], "name"],
        required: false,
      },
      {
        model: db.Role,
        as: "role",
        attributes: [["role_id", "id"], "name"],
        required: false,
      },
      {
        model: db.RoleType,
        as: "roleType",
        attributes: [["role_type_id", "id"], ["type_name", "name"]],
        required: false,
      },
    ],
  });

  const plain = mapping.toJSON();

  return {
    userRoleMappingId: plain.user_role_mapping_id,
    user: plain.user ?? null,
    role: plain.role ?? null,
    roleType: plain.roleType ?? null,
    assignedBy: plain.assigned_by ? { id: plain.assigned_by } : null,
    assignedAt: plain.assigned_at,
  };
}
