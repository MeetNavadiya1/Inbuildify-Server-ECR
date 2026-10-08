import express from "express";

const router = express.Router();

import {
  createHlPackageLotPackageMapSchema,
  getLotPackagesByHlPackageIdSchema,
  deleteHlPackageLotPackageMapSchema,
  getAllHlPackageLotPackageMapsSchema,
} from "./hl-package-lot-package-map.validation.js";
import {
  createHlPackageLotPackageMap,
  getLotPackagesByHlPackageId,
  deleteHlPackageLotPackageMap,
  getAllHlPackageLotPackageMaps,
} from "./hl-package-lot-package-map.controller.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get(
  "/",
  validateRequest(getAllHlPackageLotPackageMapsSchema, REQUEST_SOURCE.QUERY),
  getAllHlPackageLotPackageMaps,
);

router.post(
  "/",
  validateRequest(createHlPackageLotPackageMapSchema, REQUEST_SOURCE.BODY),
  createHlPackageLotPackageMap,
);

router.get(
  "/:house_land_package_id",
  validateRequest(getLotPackagesByHlPackageIdSchema, REQUEST_SOURCE.PARAMS),
  getLotPackagesByHlPackageId,
);

router.delete(
  "/:id",
  validateRequest(deleteHlPackageLotPackageMapSchema, REQUEST_SOURCE.PARAMS),
  deleteHlPackageLotPackageMap,
);

export default router;
