import express from "express";

const router = express.Router();
import {
  createCostCenter,
  getCostCenters,
  getCostCenterById,
  updateCostCenter,
  deleteCostCenter,
  toggleCostCenterStatus,
  createCostCenterChecklistMap,
  getCostCenterChecklistMaps,
  deleteCostCenterChecklistMap,
} from "./cost-center.controller.js";
import {
  createCostCenterSchema,
  updateCostCenterSchema,
  costCenterParamsSchema,
  createCostCenterChecklistMapSchema,
  costCenterChecklistMapQuerySchema,
  costCenterChecklistMapParamsSchema,
  getAllCostCentersSchema,
} from "./cost-center.validation.js";
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
  requirePermission(MODULES.COST_CENTRE, ACTIONS.CREATE),
  validateRequest(createCostCenterSchema, REQUEST_SOURCE.BODY),
  createCostCenter,
);

router.get(
  "/",
  requirePermission(MODULES.COST_CENTRE, ACTIONS.READ),
  validateRequest(getAllCostCentersSchema, REQUEST_SOURCE.QUERY),
  getCostCenters,
);

//get cost center checklist map
router.get(
  "/checklist-map",
  requirePermission(MODULES.COST_CENTRE, ACTIONS.READ),
  validateRequest(costCenterChecklistMapQuerySchema, REQUEST_SOURCE.QUERY),
  getCostCenterChecklistMaps,
);

router.get(
  "/:cost_center_id",
  requirePermission(MODULES.COST_CENTRE, ACTIONS.READ),
  validateRequest(costCenterParamsSchema, REQUEST_SOURCE.PARAMS),
  getCostCenterById,
);

router.put(
  "/:cost_center_id",
  requirePermission(MODULES.COST_CENTRE, ACTIONS.UPDATE),
  validateRequest(costCenterParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateCostCenterSchema, REQUEST_SOURCE.BODY),
  updateCostCenter,
);

router.put(
  "/is-active/:cost_center_id",
  requirePermission(MODULES.COST_CENTRE, ACTIONS.UPDATE),
  validateRequest(costCenterParamsSchema, REQUEST_SOURCE.PARAMS),
  toggleCostCenterStatus,
);

router.delete(
  "/:cost_center_id",
  requirePermission(MODULES.COST_CENTRE, ACTIONS.DELETE),
  validateRequest(costCenterParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteCostCenter,
);

// Cost Center Checklist Map Routes
router.post(
  "/checklist-map",
  requirePermission(MODULES.COST_CENTRE, ACTIONS.CREATE),
  validateRequest(createCostCenterChecklistMapSchema, REQUEST_SOURCE.BODY),
  createCostCenterChecklistMap,
);

router.delete(
  "/checklist-map/:id",
  requirePermission(MODULES.COST_CENTRE, ACTIONS.DELETE),
  validateRequest(costCenterChecklistMapParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteCostCenterChecklistMap,
);

export default router;
