import express from "express";

const router = express.Router();

import { createSupplier, getAllSuppliers, deleteSupplier, updateSupplier, getSupplierById } from "./supplier.controller.js";
import {
  createSupplierSchema,
  getAllSupplierSchema,
  deleteSupplierSchema,
  getSupplierByIdSchema,
  updateSupplierParamsSchema,
  updateSupplierSchema,
} from "./supplier.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createUpload,createPdfUpload, handleMulterError } from "../../utils/s3Upload.js";

const upload = createPdfUpload("supplier");

router.use(authMiddleware);
router.use(roleMiddleware);

// Custom middleware to parse JSON strings in form data
const parseJsonFields = (req, res, next) => {
  const jsonFields = ["contacts"];

  for (const field of jsonFields) {
    if (req.body[field] && typeof req.body[field] === "string") {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${field} format. Must be valid JSON array.`,
        });
      }
    }
  }
  next();
};

router.post(
  "/",
  upload.fields([
    { name: "workCoverUrl", maxCount: 1 },
    { name: "plInsuranceUrl", maxCount: 1 },
    { name: "whiteCardUrl", maxCount: 1 },
    { name: "forkLiftLicenseUrl", maxCount: 1 },
    { name: "tradeLicenseUrl", maxCount: 1 },
    { name: "inductionPackUrl", maxCount: 1 },
  ]),
  handleMulterError,
  parseJsonFields,
  camelToSnakeMiddleware,
  validateRequest(createSupplierSchema, REQUEST_SOURCE.FORM_DATA),
  createSupplier,
);

router.get(
  "/",
  camelToSnakeMiddleware,
  validateRequest(getAllSupplierSchema, REQUEST_SOURCE.QUERY),
  getAllSuppliers,
);

router.delete(
  "/:supplier_id",
  camelToSnakeMiddleware,
  validateRequest(deleteSupplierSchema, REQUEST_SOURCE.PARAMS),
  deleteSupplier,
);

router.get(
  "/:supplier_id",
  camelToSnakeMiddleware,
  validateRequest(getSupplierByIdSchema, REQUEST_SOURCE.PARAMS),
  getSupplierById,
);

router.put(
  "/:supplier_id",
  upload.fields([
    { name: "workCoverUrl", maxCount: 1 },
    { name: "plInsuranceUrl", maxCount: 1 },
    { name: "whiteCardUrl", maxCount: 1 },
    { name: "forkLiftLicenseUrl", maxCount: 1 },
    { name: "tradeLicenseUrl", maxCount: 1 },
    { name: "inductionPackUrl", maxCount: 1 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateSupplierParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSupplierSchema, REQUEST_SOURCE.FORM_DATA),
  updateSupplier,
);

export default router;
