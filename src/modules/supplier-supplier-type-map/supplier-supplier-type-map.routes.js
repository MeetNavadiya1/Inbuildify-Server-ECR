import express from "express";

const router = express.Router();

import {
  createSupplierTypeMap,
  getAllSupplierTypeMaps,
  deleteSupplierSupplierTypeMap,
  updateSupplierTypeMap,
  createSupplierTypeConstructionChecklistMap,
  getAllSupplierTypeConstructionChecklistMaps,
  deleteSupplierTypeConstructionChecklistMap,
} from "./supplier-supplier-type-map.controller.js";
import {
  createSupplierTypeMapSchema,
  getAllSupplierTypeMapsSchema,
  deleteSupplierSupplierTypeMapSchema,
  updateSupplierTypeMapSchema,
  updateSupplierTypeParamsSchema,
  createSupplierTpeChecklistSchema,
} from "./supplier-supplier-type-map.validation.js";
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
  validateRequest(createSupplierTypeMapSchema, REQUEST_SOURCE.BODY),
  createSupplierTypeMap,
);

router.get(
  "/",
  validateRequest(getAllSupplierTypeMapsSchema, REQUEST_SOURCE.QUERY),
  getAllSupplierTypeMaps,
);

router.delete(
  "/:id",
  validateRequest(deleteSupplierSupplierTypeMapSchema, REQUEST_SOURCE.PARAMS),
  deleteSupplierSupplierTypeMap,
);

router.put(
  "/:id",
  validateRequest(updateSupplierTypeParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSupplierTypeMapSchema, REQUEST_SOURCE.BODY),
  updateSupplierTypeMap,
);

// supplier type with construction checklist map

router.post(
  "/checklist-map",
  validateRequest(createSupplierTpeChecklistSchema, REQUEST_SOURCE.BODY),
  createSupplierTypeConstructionChecklistMap,
);

router.get(
  "/checklist-map",
  validateRequest(getAllSupplierTypeMapsSchema, REQUEST_SOURCE.QUERY),
  getAllSupplierTypeConstructionChecklistMaps,
);

router.delete(
  "/checklist-map/:id",
  validateRequest(deleteSupplierSupplierTypeMapSchema, REQUEST_SOURCE.PARAMS),
  deleteSupplierTypeConstructionChecklistMap,
);
export default router;
