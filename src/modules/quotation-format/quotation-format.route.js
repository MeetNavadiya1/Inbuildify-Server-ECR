import express from "express"
import {
  createQuotationFormat,
  updateQuotationFormat,
  getQuotationFormatById,
  getAllQuotationFormats,
  deleteQuotationFormat,
  copyQuotationFormat,
} from "./quotation-format.controller.js";
import {
  createQuotationFormatSchema,
  updateQuotationFormatSchema,
  getAllQuotationFormatSchema,
  quotationFormatIdSchema,
} from "./quotation-format.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createImageUpload, handleMulterError } from "../../utils/s3Upload.js";


const router = express.Router();
const upload = createImageUpload("quotation-format");
// Apply common middleware
router.use(authMiddleware);
router.use(roleMiddleware);

router.post(
  "/",
  upload.fields([
    { name: "watermark", maxCount: 1 },
    { name: "defaultFacade", maxCount: 1 },
    { name: "draftBackgroundImage", maxCount: 1 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createQuotationFormatSchema, REQUEST_SOURCE.FORM_DATA),
  createQuotationFormat
);

// Get all Quotation Formats
router.get(
  "/",
  validateRequest(getAllQuotationFormatSchema, REQUEST_SOURCE.QUERY),
  getAllQuotationFormats
);

// Get a single Quotation Format by ID
router.get(
  "/:quotation_format_id",
  validateRequest(quotationFormatIdSchema, REQUEST_SOURCE.PARAMS),
  getQuotationFormatById
);

// Delete a Quotation Format
router.delete(
  "/:quotation_format_id",
  validateRequest(quotationFormatIdSchema, REQUEST_SOURCE.PARAMS),
  deleteQuotationFormat
);

// Copy a Quotation Format
router.post(
  "/:quotation_format_id/copy",
  validateRequest(quotationFormatIdSchema, REQUEST_SOURCE.PARAMS),
  copyQuotationFormat
);

// Update an existing Quotation Format
router.put(
  "/:quotation_format_id",
  upload.fields([
    { name: "watermark", maxCount: 1 },
    { name: "defaultFacade", maxCount: 1 },
    { name: "draftBackgroundImage", maxCount: 1 },
  ]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(quotationFormatIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateQuotationFormatSchema, REQUEST_SOURCE.FORM_DATA),
  updateQuotationFormat
);

export default router;