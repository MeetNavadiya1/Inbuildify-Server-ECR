import express from "express";

const router = express.Router();

import { createSupplierDocument, getAllSupplierDocuments, updateSupplierDocument } from "./supplier-document.controller.js";
import {
  createSupplierContactSchema,
  getAllSupplierDocumentSchema,
  updateSupplierDocumentParamsSchema,
  updateSupplierDocumentSchema,
} from "./supplier-document.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createUpload, createPdfUpload,handleMulterError } from "../../utils/s3Upload.js";

router.use(authMiddleware);
router.use(roleMiddleware);

const upload = createPdfUpload("supplier-document");

router.post(
  "/",
  upload.fields([
    { name: "workCoverImage", maxCount: 1 },
    { name: "plInsuranceImage", maxCount: 1 },
    { name: "whiteCardImage", maxCount: 1 },
    { name: "forkLiftLicenseImage", maxCount: 1 },
    { name: "tradeLicenseImage", maxCount: 1 },
    { name: "inductionPackImage", maxCount: 1 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createSupplierContactSchema, REQUEST_SOURCE.FORM_DATA),
  createSupplierDocument,
);

router.get(
  "/",
  camelToSnakeMiddleware,
  validateRequest(getAllSupplierDocumentSchema, REQUEST_SOURCE.QUERY),
  getAllSupplierDocuments,
);

router.put(
  "/:id",
  upload.fields([
    { name: "workCoverImage", maxCount: 1 },
    { name: "plInsuranceImage", maxCount: 1 },
    { name: "whiteCardImage", maxCount: 1 },
    { name: "forkLiftLicenseImage", maxCount: 1 },
    { name: "tradeLicenseImage", maxCount: 1 },
    { name: "inductionPackImage", maxCount: 1 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateSupplierDocumentParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSupplierDocumentSchema, REQUEST_SOURCE.FORM_DATA),
  updateSupplierDocument,
);
export default router;
