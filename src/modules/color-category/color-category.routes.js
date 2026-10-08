import express from "express";

const router = express.Router();

import {
  createColorCategory,
  getColorCategories,
  getColorCategoryById,
  getColorCategoriesByColorId,
  updateColorCategory,
  deleteColorCategory,
  copyColorCategory,
} from "./color-category.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  createColorCategorySchema,
  updateColorCategorySchema,
  paramsIdSchema,
  copyColorCategorySchema,
} from "./color-category.validation.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

router.post(
  "/",
  requirePermission(MODULES.COLOR_CATEGORY, ACTIONS.CREATE),
  camelToSnakeMiddleware,
  validateRequest(createColorCategorySchema, REQUEST_SOURCE.BODY),
  createColorCategory,
);

router.get("/", requirePermission(MODULES.COLOR_CATEGORY, ACTIONS.READ), getColorCategories);

router.get("/:id", requirePermission(MODULES.COLOR_CATEGORY, ACTIONS.READ), getColorCategoriesByColorId);

router.put(
  "/:id",
  requirePermission(MODULES.COLOR_CATEGORY, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(paramsIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateColorCategorySchema, REQUEST_SOURCE.BODY),
  updateColorCategory,
);

router.delete(
  "/:id",
  requirePermission(MODULES.COLOR_CATEGORY, ACTIONS.DELETE),
  validateRequest(paramsIdSchema, REQUEST_SOURCE.PARAMS),
  deleteColorCategory,
);

// POST /api/color-category/:id/copy - Copy a color category to a specific color
router.post(
  "/copy/:id",
  requirePermission(MODULES.COLOR_CATEGORY, ACTIONS.CREATE),
  validateRequest(paramsIdSchema, REQUEST_SOURCE.PARAMS),
  camelToSnakeMiddleware,
  validateRequest(copyColorCategorySchema, REQUEST_SOURCE.BODY),
  copyColorCategory,
);

export default router;
