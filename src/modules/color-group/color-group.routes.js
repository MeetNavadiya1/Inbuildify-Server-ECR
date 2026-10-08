import express from "express";

const router = express.Router();

import {
  createColorGroup,
  getAllColorGroups,
  getColorGroupById,
  updateColorGroup,
  deleteColorGroup,
} from "./color-group.controller.js";
import {
  createColorGroupSchema,
  getAllColorGroupsSchema,
  getColorGroupByIdSchema,
  updateColorGroupParamsSchema,
  updateColorGroupSchema,
  deleteColorGroupSchema,
} from "./color-group.validation.js";
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

// Create a new color group
router.post(
  "/",
  requirePermission(MODULES.COLOR_GROUP, ACTIONS.CREATE),
  validateRequest(createColorGroupSchema, REQUEST_SOURCE.BODY),
  createColorGroup,
);

// Get all color groups with pagination and filtering
router.get(
  "/",
  requirePermission(MODULES.COLOR_GROUP, ACTIONS.READ),
  validateRequest(getAllColorGroupsSchema, REQUEST_SOURCE.QUERY),
  getAllColorGroups,
);

// Get a specific color group by ID
router.get(
  "/:colorGroupId",
  requirePermission(MODULES.COLOR_GROUP, ACTIONS.READ),
  validateRequest(getColorGroupByIdSchema, REQUEST_SOURCE.PARAMS),
  getColorGroupById,
);

// Update a color group
router.put(
  "/:colorGroupId",
  requirePermission(MODULES.COLOR_GROUP, ACTIONS.UPDATE),
  validateRequest(updateColorGroupParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateColorGroupSchema, REQUEST_SOURCE.BODY),
  updateColorGroup,
);

// Delete a color group
router.delete(
  "/:colorGroupId",
  requirePermission(MODULES.COLOR_GROUP, ACTIONS.DELETE),
  validateRequest(deleteColorGroupSchema, REQUEST_SOURCE.PARAMS),
  deleteColorGroup,
);

export default router;
