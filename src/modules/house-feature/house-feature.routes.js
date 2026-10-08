import express from "express";

const router = express.Router();

import {
  createHouseFeature,
  getAllHouseFeatures,
  getHouseFeatureById,
  updateHouseFeature,
  deleteHouseFeature,
} from "./house-feature.controller.js";
import {
  createHouseFeatureSchema,
  updateHouseFeatureSchema,
  getHouseFeatureByIdSchema,
  deleteHouseFeatureSchema,
  getAllHouseFeaturesSchema,
} from "./house-feature.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";

router.post(
  "/",
  authMiddleware,
  roleMiddleware,
  camelToSnakeMiddleware,
  validateRequest(createHouseFeatureSchema, REQUEST_SOURCE.BODY),
  createHouseFeature,
);

router.get(
  "/",
  authMiddleware,
  roleMiddleware,
  validateRequest(getAllHouseFeaturesSchema, REQUEST_SOURCE.QUERY),
  getAllHouseFeatures,
);

router.get(
  "/:house_feature_id",
  authMiddleware,
  roleMiddleware,
  validateRequest(getHouseFeatureByIdSchema, REQUEST_SOURCE.PARAMS),
  getHouseFeatureById,
);

router.put(
  "/:house_feature_id",
  authMiddleware,
  roleMiddleware,
  camelToSnakeMiddleware,
  validateRequest(getHouseFeatureByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateHouseFeatureSchema, REQUEST_SOURCE.BODY),
  updateHouseFeature,
);

router.delete(
  "/:house_feature_id",
  authMiddleware,
  roleMiddleware,
  validateRequest(deleteHouseFeatureSchema, REQUEST_SOURCE.PARAMS),
  deleteHouseFeature,
);

export default router;
