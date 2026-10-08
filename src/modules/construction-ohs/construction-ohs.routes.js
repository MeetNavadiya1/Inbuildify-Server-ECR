import express from "express";

const router = express.Router();

import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import {
  getOhsSettings,
  upsertOhsSettings,
  getOhsList,
  createOhsListItem,
  updateOhsListItem,
  deleteOhsListItem,
} from "./construction-ohs.controller.js";
import {
  upsertSettingsSchema,
  createListItemSchema,
  updateListItemSchema,
  getListItemChema,
} from "./construction-ohs.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

// auth
router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

/* -------------------------
   SETTINGS (Signature + Audits)
-------------------------- */
router.get("/settings", requirePermission(MODULES.CONSTRUCTION_OHS, ACTIONS.READ), getOhsSettings);

router.post(
  "/settings",
  requirePermission(MODULES.CONSTRUCTION_OHS, ACTIONS.UPDATE),
  validateRequest(upsertSettingsSchema, REQUEST_SOURCE.BODY),
  upsertOhsSettings,
);

/* -------------------------
   LIST (Categories / Items)
-------------------------- */

router.post(
  "/list",
  requirePermission(MODULES.CONSTRUCTION_OHS, ACTIONS.CREATE),
  validateRequest(createListItemSchema, REQUEST_SOURCE.BODY),
  createOhsListItem,
);

router.get(
  "/list",
  requirePermission(MODULES.CONSTRUCTION_OHS, ACTIONS.READ),
  validateRequest(getListItemChema, REQUEST_SOURCE.QUERY),
  getOhsList,
);

router.put(
  "/list/:id",
  requirePermission(MODULES.CONSTRUCTION_OHS, ACTIONS.UPDATE),
  validateRequest(updateListItemSchema, REQUEST_SOURCE.BODY),
  updateOhsListItem,
);

router.delete("/list/:id", requirePermission(MODULES.CONSTRUCTION_OHS, ACTIONS.DELETE), deleteOhsListItem);

export default router;
