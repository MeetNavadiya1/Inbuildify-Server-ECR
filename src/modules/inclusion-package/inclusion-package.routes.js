import express from "express";

const router = express.Router();

import {
  createInclusionPackage,
  getAllInclusionPackages,
  getInclusionPackageById,
  updateInclusionPackage,
  deleteInclusionPackage,
} from "./inclusion-package.controller.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createInclusionPackageSchema,
  updateInclusionPackageSchema,
  inclusionPackageIdSchema,
} from "./inclusion-package.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post("/", validateRequest(createInclusionPackageSchema), createInclusionPackage);
router.get("/", getAllInclusionPackages);
router.get(
  "/:id",
  validateRequest(inclusionPackageIdSchema, REQUEST_SOURCE.PARAMS),
  getInclusionPackageById,
);
router.put(
  "/:id",
  validateRequest(inclusionPackageIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateInclusionPackageSchema, REQUEST_SOURCE.BODY),
  updateInclusionPackage,
);
router.delete(
  "/:id",
  validateRequest(inclusionPackageIdSchema, REQUEST_SOURCE.PARAMS),
  deleteInclusionPackage,
);

export default router;
