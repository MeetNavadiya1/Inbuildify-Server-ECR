import express from "express";

const router = express.Router();

import {
  createHouseLandPackage,
  getAllHouseLandPackages,
  updateHouseLandPackage,
  deleteHouseLandPackage,
  getHouseLandPackageById,
} from "./house-land-package.controller.js";
import {
  createHouseLandPackageSchema,
  updateHouseLandPackageSchema,
  deleteHouseLandPackageSchema,
  getAllHouseLandPackagesSchema,
  getHouseLandPackageByIdSchema,
} from "./house-land-package.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { handleMulterError, createPdfUpload } from "../../utils/s3Upload.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

const upload = createPdfUpload("house-land-package-attachments");

router.post(
  "/",
  validateRequest(createHouseLandPackageSchema, REQUEST_SOURCE.BODY),
  createHouseLandPackage,
);

router.get(
  "/",
  validateRequest(getAllHouseLandPackagesSchema, REQUEST_SOURCE.QUERY),
  getAllHouseLandPackages,
);

router.get(
  "/:house_land_package_id",
  validateRequest(getHouseLandPackageByIdSchema, REQUEST_SOURCE.PARAMS),
  getHouseLandPackageById,
);

router.put(
  "/:house_land_package_id",
  upload.any(),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(getHouseLandPackageByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateHouseLandPackageSchema, REQUEST_SOURCE.FORM_DATA),
  updateHouseLandPackage,
);

router.delete(
  "/:house_land_package_id",
  validateRequest(deleteHouseLandPackageSchema, REQUEST_SOURCE.PARAMS),
  deleteHouseLandPackage,
);

export default router;
