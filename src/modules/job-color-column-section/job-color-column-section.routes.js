import express from "express";

const router = express.Router();

import {
  createJobColorColumnSection,
  getJobColorColumnSections,
  deleteJobColorColumnSection,
  updateJobColorColumnSection,
} from "./job-color-column-section.controller.js";
import {
  createJobColorColumnSectionSchema,
  getJobColorColumnSectionsSchema,
  deleteJobColorColumnSectionSchema,
  updateJobColorColumnSectionParamsSchema,
  updateJobColorColumnSectionSchema,
} from "./job-color-column-section.validation.js";
import { createUpload, createPdfUpload, handleMulterError } from "../../utils/s3Upload.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);

const upload = createPdfUpload("job-color-column-section");

router.post(
  "/",
  upload.single("attachments"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createJobColorColumnSectionSchema, REQUEST_SOURCE.FORM_DATA),
  createJobColorColumnSection,
);

router.get(
  "/",
  camelToSnakeMiddleware,
  validateRequest(getJobColorColumnSectionsSchema, REQUEST_SOURCE.QUERY),
  getJobColorColumnSections,
);

router.delete(
  "/:job_color_column_section_id",
  validateRequest(deleteJobColorColumnSectionSchema, REQUEST_SOURCE.PARAMS),
  deleteJobColorColumnSection,
);

router.put(
  "/:job_color_column_section_id",
  upload.single("attachments"),
  camelToSnakeMiddleware,
  handleMulterError,
  validateRequest(
    updateJobColorColumnSectionParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updateJobColorColumnSectionSchema, REQUEST_SOURCE.FORM_DATA),
  updateJobColorColumnSection,
);

export default router;
