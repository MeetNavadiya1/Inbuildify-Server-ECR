import express from "express";

const router = express.Router();

import {
  createTemplatePdf,
  updateTemplatePdf,
  getTemplatePdfById,
  getTemplatePdfList,
} from "./template-pdf.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createTemplatePdfSchema, updateTemplatePdfSchema } from "./template-pdf.validation.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";
import parseFormDataJson from "../../middleware/parseFormDataJson.js";

const upload = createUpload("pdf-template-assets");

router.use(authMiddleware);
router.use(roleMiddleware);

/** LIST */
router.get("/", getTemplatePdfList);

/** GET BY ID */
router.get("/:template_pdf_id", getTemplatePdfById);

/** CREATE */
router.post(
  "/",
  upload.fields([
    { name: "logoImage", maxCount: 1 },
    { name: "watermarkImage", maxCount: 1 },
  ]),
  handleMulterError,
  parseFormDataJson,
  camelToSnakeMiddleware,
  validateRequest(createTemplatePdfSchema, REQUEST_SOURCE.FORM_DATA),
  createTemplatePdf,
);

/** UPDATE */
router.put(
  "/:template_pdf_id",
  upload.fields([
    { name: "logoImage", maxCount: 1 },
    { name: "watermarkImage", maxCount: 1 },
  ]),
  handleMulterError,
  parseFormDataJson,
  camelToSnakeMiddleware,
  validateRequest(updateTemplatePdfSchema, REQUEST_SOURCE.FORM_DATA),
  updateTemplatePdf,
);

export default router;
