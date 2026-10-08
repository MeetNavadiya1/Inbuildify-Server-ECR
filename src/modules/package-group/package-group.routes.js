import express from "express";

const router = express.Router();

import {
  createPackageGroup,
  getAllPackageGroups,
  deletePackageGroup,
  updatePackageGroup,
} from "./package-group.controller.js";
import {
  createPackageGroupSchema,
  getAllPackageGroupSchema,
  deletePackageGroupSchema,
  updatePackageGroupParamsSchema,
  updatePackageGroupSchema,
} from "./package-group.validation.js";
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
  validateRequest(createPackageGroupSchema, REQUEST_SOURCE.BODY),
  createPackageGroup,
);

router.get(
  "/",
  validateRequest(getAllPackageGroupSchema, REQUEST_SOURCE.QUERY),
  getAllPackageGroups,
);

router.delete(
  "/:package_group_id",
  validateRequest(deletePackageGroupSchema, REQUEST_SOURCE.PARAMS),
  deletePackageGroup,
);

router.put(
  "/:package_group_id",
  validateRequest(updatePackageGroupParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updatePackageGroupSchema, REQUEST_SOURCE.BODY),
  updatePackageGroup,
);
export default router;
