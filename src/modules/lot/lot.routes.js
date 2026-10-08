import express from "express";

const router = express.Router();
import { createLot, getAllLots, getLotById, updateLot, deleteLot } from "./lot.controller.js";
import {
  createLotSchema,
  updateLotSchema,
  getLotByIdSchema,
  deleteLotSchema,
  getAllLotsSchema,
} from "./lot.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

// Lots fall under Estates (design doc §4.9) — guard on the ESTATE module.
router.post(
  "/",
  requirePermission(MODULES.ESTATE, ACTIONS.CREATE),
  validateRequest(createLotSchema, REQUEST_SOURCE.BODY),
  createLot,
);

router.get(
  "/",
  requirePermission(MODULES.ESTATE, ACTIONS.READ),
  validateRequest(getAllLotsSchema, REQUEST_SOURCE.QUERY),
  getAllLots,
);

router.get(
  "/:lot_id",
  requirePermission(MODULES.ESTATE, ACTIONS.READ),
  validateRequest(getLotByIdSchema, REQUEST_SOURCE.PARAMS),
  getLotById,
);

router.put(
  "/:lot_id",
  requirePermission(MODULES.ESTATE, ACTIONS.UPDATE),
  validateRequest(getLotByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateLotSchema, REQUEST_SOURCE.BODY),
  updateLot,
);

router.delete(
  "/:lot_id",
  requirePermission(MODULES.ESTATE, ACTIONS.DELETE),
  validateRequest(deleteLotSchema, REQUEST_SOURCE.PARAMS),
  deleteLot,
);

export default router;
