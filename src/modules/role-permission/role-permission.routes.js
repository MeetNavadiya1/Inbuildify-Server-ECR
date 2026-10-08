import express from "express";

const router = express.Router();

import {
  createRolePermission,
  getAllRolePermission,
  deleteRolePermission,
  updateRolePermission,
  updateRolePermissionIsActive,
} from "./role-permission.controller.js";
import {
  createRolePermissionSchema,
  getAllRolePermissionSchema,
  deleteRolePermissionSchema,
  updatePermissionIdSchemaSchema,
  updateRolePermissionSchema,
  updateRolePermissionIsActiveSchema,
} from "./role-permission.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

router.post(
  "/",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.CREATE),
  validateRequest(createRolePermissionSchema, REQUEST_SOURCE.BODY),
  createRolePermission,
);

router.get(
  "/",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.READ),
  validateRequest(getAllRolePermissionSchema, REQUEST_SOURCE.QUERY),
  getAllRolePermission,
);

router.delete(
  "/:id",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.DELETE),
  validateRequest(deleteRolePermissionSchema, REQUEST_SOURCE.PARAMS),
  deleteRolePermission,
);

router.put(
  "/:role_permission_id",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.UPDATE),
  validateRequest(updatePermissionIdSchemaSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateRolePermissionSchema, REQUEST_SOURCE.BODY),
  updateRolePermission,
);

router.put(
  "/is-active/:role_permission_id",
  requirePermission(MODULES.ROLE_MANAGEMENT, ACTIONS.UPDATE),
  validateRequest(updatePermissionIdSchemaSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateRolePermissionIsActiveSchema, REQUEST_SOURCE.BODY),
  updateRolePermissionIsActive,
);

export default router;
