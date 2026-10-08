import express from "express";

const router = express.Router();

import {
  createProperty,
  getPropertyByLeadId,
  updateProperty,
  deleteProperty,
} from "./property.controller.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createPropertySchema,
  getPropertyByLeadSchema,
  updatePropertySchema,
  updatePropertyParamSchema,
  deletePropertySchema,
  createPropertyParamSchema,
} from "./property.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createPdfUpload, handleMulterError } from "../../utils/s3Upload.js";

const parsePropertyContent = (req, res, next) => {
  const contentKey = "compaction_report_content";
  const camelKey = "compactionReportContent";
  const key = req.body[contentKey] ? contentKey : (req.body[camelKey] ? camelKey : null);

  if (key && typeof req.body[key] === "string") {
    try {
      const cleanValue = req.body[key]
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, "\"")
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
      req.body[camelKey] = JSON.parse(cleanValue);

      if (key === contentKey) {
        delete req.body[contentKey];
      }
    } catch (err) {
      console.error(`[ERROR] Parsing ${key}:`, err.message);
    }
  }
  next();
};

const upload = createPdfUpload("compaction_report");

router.use(authMiddleware);
router.use(roleMiddleware);

router.post(
  "/:leads_id",
  upload.single("compactionReportUrl"),
  handleMulterError,
  parsePropertyContent,
  camelToSnakeMiddleware,
  validateRequest(createPropertyParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(createPropertySchema, REQUEST_SOURCE.FORM_DATA),
  createProperty,
);
router.get("/:leads_id", validateRequest(getPropertyByLeadSchema, REQUEST_SOURCE.PARAMS), getPropertyByLeadId);

router.put(
  "/:property_detail_id",
  upload.single("compactionReportUrl"),
  handleMulterError,
  parsePropertyContent,
  camelToSnakeMiddleware,
  validateRequest(updatePropertyParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updatePropertySchema, REQUEST_SOURCE.FORM_DATA),
  updateProperty,
);
router.delete(
  "/:property_detail_id",
  validateRequest(deletePropertySchema, REQUEST_SOURCE.PARAMS),
  deleteProperty,
);

export default router;
