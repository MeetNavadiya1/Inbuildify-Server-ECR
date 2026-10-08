import express from "express";

const router = express.Router();

import {
  createFloorPlan,
  getFloorPlans,
  updateFloorPlan,
  deleteFloorPlan,
  getFloorPlanFilters,
} from "./floor-plan.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  createFloorPlanSchema,
  getFloorPlansSchema,
  updateFloorPlanParamsSchema,
  updateFloorPlanSchema,
  deleteFloorPlanSchema,
} from "./floor-plan.validation.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

const upload = createUpload("floor-plans");

router.post(
  "/",
  requirePermission(MODULES.FLOOR_PLAN, ACTIONS.CREATE),
  upload.fields([
    { name: "detailedImage", maxCount: 1 },
    { name: "simpleImage", maxCount: 1 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createFloorPlanSchema, REQUEST_SOURCE.FORM_DATA),
  createFloorPlan,
);

router.get(
  "/",
  requirePermission(MODULES.FLOOR_PLAN, ACTIONS.READ),
  camelToSnakeMiddleware,
  validateRequest(getFloorPlansSchema, REQUEST_SOURCE.QUERY),
  getFloorPlans,
);

router.get("/filters", requirePermission(MODULES.FLOOR_PLAN, ACTIONS.READ), getFloorPlanFilters);

router.put(
  "/:floor_plan_id",
  requirePermission(MODULES.FLOOR_PLAN, ACTIONS.UPDATE),
  upload.fields([
    { name: "detailedImage", maxCount: 1 },
    { name: "simpleImage", maxCount: 1 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateFloorPlanParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateFloorPlanSchema, REQUEST_SOURCE.FORM_DATA),
  updateFloorPlan,
);

router.delete(
  "/:floor_plan_id",
  requirePermission(MODULES.FLOOR_PLAN, ACTIONS.DELETE),
  camelToSnakeMiddleware,
  validateRequest(deleteFloorPlanSchema, REQUEST_SOURCE.PARAMS),
  deleteFloorPlan,
);

export default router;
