import express from "express";

const router = express.Router();

import {
  createFloorPlanPricelistItemMap,
  getAllFloorPlanPricelistItemMaps,
  getFloorPlanPricelistItemMapById,
  updateFloorPlanPricelistItemMap,
  deleteFloorPlanPricelistItemMap,
} from "./floor-plan-pricelist-item-map.controller.js";
import {
  createFloorPlanPricelistItemMapValidation,
  updateFloorPlanPricelistItemMapValidation,
  getFloorPlanPricelistItemMapByIdValidation,
  queryValidation,
} from "./floor-plan-pricelist-item-map.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(
    createFloorPlanPricelistItemMapValidation,
    REQUEST_SOURCE.BODY,
  ),
  createFloorPlanPricelistItemMap,
);

router.get(
  "/",
  validateRequest(queryValidation, REQUEST_SOURCE.QUERY),
  getAllFloorPlanPricelistItemMaps,
);

router.get(
  "/:id",
  validateRequest(
    getFloorPlanPricelistItemMapByIdValidation,
    REQUEST_SOURCE.PARAMS,
  ),
  getFloorPlanPricelistItemMapById,
);

router.put(
  "/:id",
  validateRequest(
    getFloorPlanPricelistItemMapByIdValidation,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(
    updateFloorPlanPricelistItemMapValidation,
    REQUEST_SOURCE.BODY,
  ),
  updateFloorPlanPricelistItemMap,
);

router.delete(
  "/:id",
  validateRequest(
    getFloorPlanPricelistItemMapByIdValidation,
    REQUEST_SOURCE.PARAMS,
  ),
  deleteFloorPlanPricelistItemMap,
);

export default router;
