import express from "express";
import {
  addJobVariationItem,
  addExtraJobVariationItem,
  updateJobVariationItem,
  updateExtraJobVariationItem,
  getJobVariationItems,
  getJobVariationItemById,
  deleteJobVariationItem,
} from "./job-variation-item.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  addJobVariationItemSchema,
  addExtraJobVariationItemSchema,
  updateJobVariationItemSchema,
  updateExtraJobVariationItemSchema,
  getItemsByVariationParamsSchema,
  idParamsSchema,
} from "./job-variation-item.validation.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

// Add standard price list item to variation
router.post(
  "/item",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(addJobVariationItemSchema, REQUEST_SOURCE.BODY),
  addJobVariationItem,
);

// Add extra item (additional, complimentary, discount, notes)
router.post(
  "/extra-item/:variation_id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(getItemsByVariationParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(addExtraJobVariationItemSchema, REQUEST_SOURCE.BODY),
  addExtraJobVariationItem,
);

// Update extra item details
router.put(
  "/extra-item/:id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateExtraJobVariationItemSchema, REQUEST_SOURCE.BODY),
  updateExtraJobVariationItem,
);

// Update standard/general variation item
router.put(
  "/:id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateJobVariationItemSchema, REQUEST_SOURCE.BODY),
  updateJobVariationItem,
);

// Fetch all variation items for a variation
router.get(
  "/variation/:variation_id",
  requirePermission(MODULES.JOB, ACTIONS.READ),
  validateRequest(getItemsByVariationParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobVariationItems,
);

// Fetch a single variation item by ID
router.get(
  "/:id",
  requirePermission(MODULES.JOB, ACTIONS.READ),
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobVariationItemById,
);

// Delete variation item
router.delete(
  "/item/:id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteJobVariationItem,
);

export default router;
