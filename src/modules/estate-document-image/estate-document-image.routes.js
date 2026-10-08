import express from "express";

const router = express.Router();

import {
  getEstateImages,
  updateEstateImage,
  createEstateDocument,
  getEstateDocuments,
  updateEstateDocument,
} from "./estate-document-image.controller.js";
import {
  getEstateImageSchema,
  updateEstateImageParamsSchema,
  updateEstateImageSchema,
  createEstateDocumentSchema,
  updateEstateDocumentSchema,
} from "./estate-document-image.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createUpload, createDocumentUpload, handleMulterError } from "../../utils/s3Upload.js";

router.use(authMiddleware);
router.use(roleMiddleware);

// Configure S3 upload for estate files
const upload = createUpload("estate-image");
const uploadDocument = createDocumentUpload("estate-document");

/* -----------------------------
   ESTATE IMAGES ROUTES
------------------------------ */

router.get(
  "/image",
  validateRequest(getEstateImageSchema, REQUEST_SOURCE.QUERY),
  getEstateImages,
);

router.put(
  "/image/:id",
  upload.single("imageUrl"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateEstateImageParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateEstateImageSchema, REQUEST_SOURCE.FORM_DATA),
  updateEstateImage,
);

/* -----------------------------
   ESTATE DOCUMENTS ROUTES
------------------------------ */

router.post(
  "/documents",
  uploadDocument.single("fileUrl"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createEstateDocumentSchema, REQUEST_SOURCE.FORM_DATA),
  createEstateDocument,
);

router.get("/documents", getEstateDocuments);

router.put(
  "/documents/:id",
  uploadDocument.single("fileUrl"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateEstateDocumentSchema, REQUEST_SOURCE.FORM_DATA),
  updateEstateDocument,
);

export default router;
