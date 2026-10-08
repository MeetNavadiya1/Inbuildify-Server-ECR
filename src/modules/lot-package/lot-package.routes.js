import express from "express";

const router = express.Router();

import {
  createLotPackageSchema,
  updateLotPackageSchema,
  getLotPackageByIdSchema,
  deleteLotPackageSchema,
  getAllLotPackagesSchema,
} from "./lot-package.validation.js";
import {
  createLotPackage,
  getAllLotPackages,
  getLotPackageById,
  updateLotPackage,
  deleteLotPackage,
} from "./lot-package.controller.js";
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
  validateRequest(createLotPackageSchema, REQUEST_SOURCE.BODY),
  createLotPackage,
);

router.get(
  "/",
  validateRequest(getAllLotPackagesSchema, REQUEST_SOURCE.QUERY),
  getAllLotPackages,
);

router.get(
  "/:lot_package_id",
  validateRequest(getLotPackageByIdSchema, REQUEST_SOURCE.PARAMS),
  getLotPackageById,
);

router.put(
  "/:lot_package_id",
  validateRequest(getLotPackageByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateLotPackageSchema, REQUEST_SOURCE.BODY),
  updateLotPackage,
);

router.delete(
  "/:lot_package_id",
  validateRequest(deleteLotPackageSchema, REQUEST_SOURCE.PARAMS),
  deleteLotPackage,
);

export default router;
