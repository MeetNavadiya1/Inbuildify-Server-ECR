import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";

// ============================================================
//        ROLE PERMISSION CRUD OPERATIONS
// ============================================================

export async function createRolePermission(currentUser, payload) {
  const { RolePermission, Role } = db;
  const { role_id, module_name, can_create, can_read, can_update, can_delete, is_active } = payload;
  const builderId = currentUser.builder_id;
  const companyId = currentUser.company_id;
  const userId = currentUser.users_id;

  if (!builderId || !companyId) {
    throw { status: 401, message: "Unauthorized." };
  }

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Check if role exists for this builder
    const role = await Role.findOne({
      where: { role_id, builder_id: builderId },
      transaction
    });

    if (!role) {
      throw { status: 404, message: "Invalid role_id: No role found for this builder." };
    }

    // 2. Check if role is active
    if (!role.is_active) {
      throw { status: 404, message: "Inactive role." };
    }

    // 3. Duplicate check for module_name
    const duplicateCheck = await RolePermission.findOne({
      where: {
        role_id,
        builder_id: builderId,
        company_id: companyId,
        module_name: { [Op.iLike]: module_name.trim() }
      },
      transaction
    });

    if (duplicateCheck) {
      throw { status: 400, message: "Permission already exists for this role and module." };
    }

    // 4. Create permission
    const newPermission = await RolePermission.create({
      role_id,
      company_id: companyId,
      builder_id: builderId,
      module_name: module_name.trim(),
      can_create: can_create ?? false,
      can_read: can_read ?? false,
      can_update: can_update ?? false,
      can_delete: can_delete ?? false,
      is_active: is_active ?? true,
      created_by: userId,
      updated_by: userId
    }, { transaction });

    await transaction.commit();
    return keysToCamelCase(newPermission.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getAllRolePermission(currentUser, filters = {}) {
  const { RolePermission } = db;
  const builderId = currentUser.builder_id;
  const { page = 1, limit = 25 } = filters;

  const limitValue = parseInt(limit, 10);
  const pageValue = parseInt(page, 10);
  const offset = (pageValue - 1) * limitValue;

  const { rows, count } = await RolePermission.findAndCountAll({
    where: { builder_id: builderId },
    order: [["createdAt", "DESC"]],
    limit: limitValue,
    offset,
    distinct: true
  });

  return {
    rolePermission: keysToCamelCase(rows.map(r => r.get({ plain: true }))),
    pagination: {
      currentPage: pageValue,
      totalPages: Math.ceil(count / limitValue),
      totalRecords: count,
      limit: limitValue,
    },
  };
}

export async function deleteRolePermission(currentUser, id) {
  const { RolePermission } = db;
  const builderId = currentUser.builder_id;

  const permission = await RolePermission.findOne({
    where: { role_permission_id: id, builder_id: builderId }
  });

  if (!permission) {
    throw { status: 404, message: "Role permission not found for this builder." };
  }

  await permission.destroy();
}

export async function updateRolePermission(currentUser, role_permission_id, payload) {
  const { RolePermission, Role } = db;
  const builderId = currentUser.builder_id;
  const userId = currentUser.users_id;
  const companyId = currentUser.company_id;

  const { role_id, module_name, can_create, can_read, can_update, can_delete } = payload;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Fetch existing permission with lock
    const permission = await RolePermission.findOne({
      where: { role_permission_id, builder_id: builderId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!permission) {
      throw { status: 404, message: "Role permission not found." };
    }

    if (!permission.is_active) {
      throw { status: 404, message: "Inactive role permission." };
    }

    let finalRoleId = permission.role_id;

    // 2. If role_id is being updated, validate it
    if (role_id && role_id !== permission.role_id) {
      const role = await Role.findOne({
        where: { role_id, builder_id: builderId, company_id: companyId },
        transaction
      });

      if (!role) {
        throw { status: 400, message: "Invalid role_id: role does not exist or not owned by this builder." };
      }

      if (!role.is_active) {
        throw { status: 400, message: "Inactive role." };
      }

      finalRoleId = role_id;
    }

    // 3. Duplicate module check
    const moduleToUpdate = module_name !== undefined ? module_name.trim() : permission.module_name;
    
    if (module_name !== undefined || (role_id && role_id !== permission.role_id)) {
      const duplicateCheck = await RolePermission.findOne({
        where: {
          role_id: finalRoleId,
          builder_id: builderId,
          company_id: companyId,
          module_name: { [Op.iLike]: moduleToUpdate },
          role_permission_id: { [Op.ne]: role_permission_id }
        },
        transaction
      });

      if (duplicateCheck) {
        throw { status: 400, message: "Module name already exists for this role." };
      }
    }

    // 4. Update fields
    const updateData = { updated_by: userId };
    if (role_id !== undefined) updateData.role_id = role_id;
    if (module_name !== undefined) updateData.module_name = module_name.trim();
    if (can_create !== undefined) updateData.can_create = can_create;
    if (can_read !== undefined) updateData.can_read = can_read;
    if (can_update !== undefined) updateData.can_update = can_update;
    if (can_delete !== undefined) updateData.can_delete = can_delete;

    await permission.update(updateData, { transaction });

    await transaction.commit();
    return keysToCamelCase(permission.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updateRolePermissionIsActive(currentUser, role_permission_id, is_active) {
  const { RolePermission } = db;
  const builderId = currentUser.builder_id;
  const userId = currentUser.users_id;

  if (typeof is_active !== "boolean") {
    throw { status: 400, message: "is_active must be boolean (true or false)" };
  }

  const permission = await RolePermission.findOne({
    where: { role_permission_id, builder_id: builderId }
  });

  if (!permission) {
    throw { status: 404, message: "role permission not found for this builder" };
  }

  await permission.update({
    is_active,
    updated_by: userId
  });

  return keysToCamelCase(permission.get({ plain: true }));
}

export default {
  createRolePermission,
  getAllRolePermission,
  deleteRolePermission,
  updateRolePermission,
  updateRolePermissionIsActive
};
