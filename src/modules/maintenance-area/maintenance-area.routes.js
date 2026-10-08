import express from "express";

const router = express.Router();

import {
  createMaintenanceArea,
  getAllMaintenanceAreas,
  deleteMaintenanceArea,
  updateMaintenanceArea,
} from "./maintenance-area.controller.js";
import {
  createMaintenanceAreaSchem,
  getAllMaintenanceAreaSchema,
  deleteMaintenanceAreaSchema,
  updateMaintenanceAreaParamsSchema,
  updateMaintenanceAreaSchema,
} from "./maintenance-area.validation.js";
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
  validateRequest(createMaintenanceAreaSchem, REQUEST_SOURCE.BODY),
  createMaintenanceArea,
);

router.get(
  "/",
  validateRequest(getAllMaintenanceAreaSchema, REQUEST_SOURCE.QUERY),
  getAllMaintenanceAreas,
);

router.delete(
  "/:maintenance_area_id",
  validateRequest(deleteMaintenanceAreaSchema, REQUEST_SOURCE.PARAMS),
  deleteMaintenanceArea,
);

router.put(
  "/:maintenance_area_id",
  validateRequest(updateMaintenanceAreaParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateMaintenanceAreaSchema, REQUEST_SOURCE.BODY),
  updateMaintenanceArea,
);

export default router;
