import express from "express";

const router = express.Router();

import { createLocation, getAllLocation, deleteLocation, updateLocation } from "./location.controller.js";
import {
  createLocationSchema,
  deleteLocationSchema,
  updateLocationParamsSchema,
  updateLocationShema,
  getAllLocationSchema,
} from "./location.validation.js";
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
  validateRequest(createLocationSchema, REQUEST_SOURCE.BODY),
  createLocation,
);

router.get(
  "/",
  validateRequest(getAllLocationSchema, REQUEST_SOURCE.QUERY),
  getAllLocation,
);

router.delete(
  "/:location_id",
  validateRequest(deleteLocationSchema, REQUEST_SOURCE.PARAMS),
  deleteLocation,
);

router.put(
  "/:location_id",
  validateRequest(updateLocationParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateLocationShema, REQUEST_SOURCE.BODY),
  updateLocation,
);

export default router;
