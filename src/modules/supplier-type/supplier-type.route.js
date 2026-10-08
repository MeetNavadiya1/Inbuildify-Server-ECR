import express from "express";

const router = express.Router();

import {
  createSupplierType,
  getAllSupplierType,
  deleteSupplierType,
  updateSupplierType,
} from "./supplier-type.controller.js";
import {
  createSuppllierTypeSchema,
  getAllSupllierTypeSchema,
  deleteSupplierTypeSchema,
  updateSupplierTypeParamsSchema,
  updateSupplierTypeSchema,
} from "./supplier-type.validation.js";
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
  validateRequest(createSuppllierTypeSchema, REQUEST_SOURCE.BODY),
  createSupplierType,
);

router.get(
  "/",
  validateRequest(getAllSupllierTypeSchema, REQUEST_SOURCE.QUERY),
  getAllSupplierType,
);

router.delete(
  "/:supplier_type_id",
  validateRequest(deleteSupplierTypeSchema, REQUEST_SOURCE.PARAMS),
  deleteSupplierType,
);

router.put(
  "/:supplier_type_id",
  validateRequest(updateSupplierTypeParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSupplierTypeSchema, REQUEST_SOURCE.BODY),
  updateSupplierType,
);

export default router;
