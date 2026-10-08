import express from "express";

const router = express.Router();

import floorPlanFacadeMapController from "./floor-plan-facade-map.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createFloorPlanFacadeMapSchema,
  getFloorPlanFacadeMapsSchema,
  deleteFloorPlanFacadeMapSchema,
} from "./floor-plan-facade-map.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.post(
  "/",
  camelToSnakeMiddleware,
  authMiddleware,
  roleMiddleware,
  validateRequest(createFloorPlanFacadeMapSchema, REQUEST_SOURCE.BODY),
  floorPlanFacadeMapController.createFloorPlanFacadeMap,
);

router.get(
  "/",
  authMiddleware,
  roleMiddleware,
  validateRequest(getFloorPlanFacadeMapsSchema, REQUEST_SOURCE.QUERY),
  floorPlanFacadeMapController.getFloorPlanFacadeMaps,
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware,
  validateRequest(deleteFloorPlanFacadeMapSchema, REQUEST_SOURCE.PARAMS),
  floorPlanFacadeMapController.deleteFloorPlanFacadeMap,
);

export default router;
