import express from "express";

const router = express.Router();

import {
  createEstateFeature,
  getAllEstateFeatures,
  getEstateFeaturesByEstateId,
  updateEstateFeature,
  deleteEstateFeature,
} from "./estate-feature.controller.js";
import {
  createEstateFeatureSchema,
  getAllEstateFeatureSchema,
  getEstateFeatureByEstateIdSchema,
  updateEstateFeatureSchema,
  updateEstateFeatureParamsSchema,
  deleteEstateFeatureSchema,
} from "./estate-feature.validation.js";
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
  requirePermission(MODULES.ESTATE, ACTIONS.CREATE),
  validateRequest(createEstateFeatureSchema, REQUEST_SOURCE.BODY),
  createEstateFeature,
);

router.get(
  "/",
  requirePermission(MODULES.ESTATE, ACTIONS.READ),
  validateRequest(getAllEstateFeatureSchema, REQUEST_SOURCE.QUERY),
  getAllEstateFeatures,
);

router.get(
  "/:estate_id",
  requirePermission(MODULES.ESTATE, ACTIONS.READ),
  validateRequest(getEstateFeatureByEstateIdSchema, REQUEST_SOURCE.PARAMS),
  getEstateFeaturesByEstateId,
);

router.put(
  "/:estate_feature_id",
  requirePermission(MODULES.ESTATE, ACTIONS.UPDATE),
  validateRequest(updateEstateFeatureParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateEstateFeatureSchema, REQUEST_SOURCE.BODY),
  updateEstateFeature,
);

router.delete(
  "/:estate_feature_id",
  requirePermission(MODULES.ESTATE, ACTIONS.DELETE),
  validateRequest(deleteEstateFeatureSchema, REQUEST_SOURCE.PARAMS),
  deleteEstateFeature,
);

export default router;
