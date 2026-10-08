import express from "express";

const
  router = express.Router();
import { createPackage, getAllPackages, updatePackage, deletePackage } from "./package.controller.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createPackageSchema,
  getAllPackagesSchema,
  updatePackageParamsSchema,
  updatePackageSchema,
  deletePackageSchema,
} from "./package.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post("/", validateRequest(createPackageSchema), createPackage);
router.post(
  "/:package_id",
  validateRequest(updatePackageSchema),
  updatePackage,
);

router.get(
  "/",
  validateRequest(getAllPackagesSchema, REQUEST_SOURCE.QUERY),
  getAllPackages,
);
// not use
router.delete(
  "/:package_id",
  validateRequest(deletePackageSchema, REQUEST_SOURCE.PARAMS),
  deletePackage,
);
//not use
router.put(
  "/:package_id",
  validateRequest(updatePackageParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updatePackageSchema, REQUEST_SOURCE.BODY),
  updatePackage,
);
export default router;
