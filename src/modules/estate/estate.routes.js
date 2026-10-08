import express from "express";

const router = express.Router();

import { createEstate, getAllEstates, deleteEstate, updateEstate } from "./estate.controller.js";
import {
  createEstateSchema,
  getAllEstateSchema,
  deleteEstateSchema,
  updateEstateParamsSchema,
  updateEstateSchema,
} from "./estate.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

const upload = createUpload("estate");

router.post(
  "/",
  requirePermission(MODULES.ESTATE, ACTIONS.CREATE),
  upload.single("estateLogo"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createEstateSchema, REQUEST_SOURCE.FORM_DATA),
  createEstate,
);

router.get(
  "/",
  requirePermission(MODULES.ESTATE, ACTIONS.READ),
  camelToSnakeMiddleware,
  validateRequest(getAllEstateSchema, REQUEST_SOURCE.QUERY),
  getAllEstates,
);

router.delete(
  "/:estate_id",
  requirePermission(MODULES.ESTATE, ACTIONS.DELETE),
  camelToSnakeMiddleware,
  validateRequest(deleteEstateSchema, REQUEST_SOURCE.PARAMS),
  deleteEstate,
);

router.put(
  "/:estate_id",
  requirePermission(MODULES.ESTATE, ACTIONS.UPDATE),
  upload.single("estateLogo"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateEstateParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateEstateSchema, REQUEST_SOURCE.BODY),
  updateEstate,
);

export default router;
