/**
 * P4 — Role management routes.
 *
 * All endpoints require:
 *   - authMiddleware  (valid JWT)
 *   - roleMiddleware  (resolves req.user.role_name)
 *   - scopeBuilder    (sets req.scope with tenant context)
 *   - requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.*)
 *
 * The company_id used for all write operations is taken from req.user.company_id
 * (set by authMiddleware) — never from the request body — so cross-tenant
 * manipulation is impossible.
 *
 * API surface (§7):
 *   GET    /role                    — list company roles
 *   POST   /role                    — create custom role
 *   PATCH  /role/:id                — rename / activate / deactivate
 *   DELETE /role/:id                — delete custom role
 *   GET    /role/:id/permissions    — full module CRUD matrix
 *   PUT    /role/:id/permissions    — bulk upsert module matrix
 */

import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

import {
  getAllRole,
  getAssignableRoles,
  createRole,
  patchRole,
  deleteRoleController,
  getRolePermissionsController,
  getMyPermissionsController,
  upsertRolePermissionsController,
  getRoleActivityLogController,
  getAllRoleActivitiesController,
} from "./role.controller.js";

import {
  listRolesSchema,
  createRoleSchema,
  patchRoleParamSchema,
  patchRoleBodySchema,
  deleteRoleParamSchema,
  getRolePermissionsParamSchema,
  upsertPermissionsParamSchema,
  upsertPermissionsBodySchema,
} from "./role.validation.js";

const router = express.Router();

// All role management routes require authentication + scope resolution
router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

// ── GET /role/assignable ──────────────────────────────────────────────────────
// Reference list for user-assignment dropdowns. Auth + tenant scope only (NOT
// ROLE_MANAGEMENT-gated) so any company user who can create users can populate
// the role dropdown. Declared before "/" and "/:id" to avoid route conflicts.
router.get("/assignable", getAssignableRoles);

// ── GET /role/my-permissions ──────────────────────────────────────────────────
// Returns the caller's own role's effective permission matrix (read-only).
// No ROLE_MANAGEMENT gate — the role's can_view_own_permissions flag controls
// access. Company Admins enable this per role via PATCH /role/:id.
// Must be declared before "/:id" to avoid Express treating "my-permissions" as
// an :id param.
router.get("/my-permissions", getMyPermissionsController);

// ── GET /role/activities ──────────────────────────────────────────────────────
// Returns a global timeline of role activities based on the caller's hierarchy.
router.get(
  "/activities",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.READ),
  getAllRoleActivitiesController
);

// ── GET /role ─────────────────────────────────────────────────────────────────
router.get(
  "/",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.READ),
  validateRequest(listRolesSchema, REQUEST_SOURCE.QUERY),
  getAllRole,
);

// ── POST /role ────────────────────────────────────────────────────────────────
router.post(
  "/",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.CREATE),
  validateRequest(createRoleSchema, REQUEST_SOURCE.BODY),
  createRole,
);

// ── GET /role/:id/permissions — must be defined BEFORE /:id to avoid conflicts
router.get(
  "/:id/permissions",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.READ),
  validateRequest(getRolePermissionsParamSchema, REQUEST_SOURCE.PARAMS),
  getRolePermissionsController,
);

// ── GET /role/:id/activities ──────────────────────────────────────────────────
router.get(
  "/:id/activities",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.READ),
  validateRequest(getRolePermissionsParamSchema, REQUEST_SOURCE.PARAMS),
  getRoleActivityLogController,
);

// ── PUT /role/:id/permissions ─────────────────────────────────────────────────
router.put(
  "/:id/permissions",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.UPDATE),
  validateRequest(upsertPermissionsParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(upsertPermissionsBodySchema, REQUEST_SOURCE.BODY),
  upsertRolePermissionsController,
);

// ── PATCH /role/:id ───────────────────────────────────────────────────────────
router.patch(
  "/:id",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.UPDATE),
  validateRequest(patchRoleParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(patchRoleBodySchema, REQUEST_SOURCE.BODY),
  patchRole,
);

// ── DELETE /role/:id ──────────────────────────────────────────────────────────
router.delete(
  "/:id",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.DELETE),
  validateRequest(deleteRoleParamSchema, REQUEST_SOURCE.PARAMS),
  deleteRoleController,
);

export default router;
