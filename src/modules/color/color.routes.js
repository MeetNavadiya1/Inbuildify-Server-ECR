import express from "express";

const router = express.Router();

import { createColor, getColors, getColorById, updateColor, deleteColor, copyColor } from "./color.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createColorSchema, updateColorSchema, copyColorSchema } from "./color.validation.js";
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
  requirePermission(MODULES.COLOR_SELECTION, ACTIONS.CREATE),
  camelToSnakeMiddleware,
  validateRequest(createColorSchema, REQUEST_SOURCE.BODY),
  createColor,
);

router.get("/", requirePermission(MODULES.COLOR_SELECTION, ACTIONS.READ), getColors);

router.get("/:id", requirePermission(MODULES.COLOR_SELECTION, ACTIONS.READ), getColorById);

router.put(
  "/:id",
  requirePermission(MODULES.COLOR_SELECTION, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(updateColorSchema, REQUEST_SOURCE.BODY),
  updateColor,
);

router.delete("/:id", requirePermission(MODULES.COLOR_SELECTION, ACTIONS.DELETE), deleteColor);

router.post(
  "/copy/:color_id",
  requirePermission(MODULES.COLOR_SELECTION, ACTIONS.CREATE),
  camelToSnakeMiddleware,
  validateRequest(copyColorSchema, REQUEST_SOURCE.BODY),
  copyColor,
);

export default router;
