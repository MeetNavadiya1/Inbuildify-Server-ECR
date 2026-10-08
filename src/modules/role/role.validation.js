/**
 * P4 — Role management validation schemas (Joi-style via existing pattern).
 * Uses the same validation helper as the rest of the codebase.
 */

import Joi from "joi";

// ─── GET /role ────────────────────────────────────────────────────────────────
export const listRolesSchema = Joi.object({
  // No required query params — returns all company roles
}).options({ allowUnknown: true });

// ─── POST /role ───────────────────────────────────────────────────────────────
export const createRoleSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).required(),
  description: Joi.string().trim().max(500).allow("", null).optional(),
  clone_from: Joi.string().uuid().allow(null).optional(),
});

// ─── PATCH /role/:id ─────────────────────────────────────────────────────────
export const patchRoleParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

export const patchRoleBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).optional(),
  description: Joi.string().trim().max(500).allow("", null).optional(),
  is_active: Joi.boolean().optional(),
  can_view_own_permissions: Joi.boolean().optional(),
}).min(1); // at least one field must be provided

// ─── DELETE /role/:id ─────────────────────────────────────────────────────────
export const deleteRoleParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// ─── GET /role/:id/permissions ────────────────────────────────────────────────
export const getRolePermissionsParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// ─── PUT /role/:id/permissions ────────────────────────────────────────────────
export const upsertPermissionsParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const permissionRowSchema = Joi.object({
  module_name: Joi.string().trim().min(1).required(),
  can_create: Joi.boolean().default(false),
  can_read: Joi.boolean().default(false),
  can_update: Joi.boolean().default(false),
  can_delete: Joi.boolean().default(false),
});

export const upsertPermissionsBodySchema = Joi.object({
  permissions: Joi.array().items(permissionRowSchema).min(1).required(),
});

// ─── Legacy (kept for backwards compat) ──────────────────────────────────────
export const getAllRoleSchema = Joi.object({}).options({ allowUnknown: true });
