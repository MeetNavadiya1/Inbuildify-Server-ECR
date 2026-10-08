import express from "express";

const router = express.Router();

import {
  createContractSection,
  getAllContractSections,
  getContractSectionById,
  updateContractSection,
  deleteContractSection,
} from "./contract-section.controller.js";
import {
  createContractSectionSchema,
  getAllContractSectionsSchema,
  getContractSectionByIdSchema,
  updateContractSectionParamsSchema,
  updateContractSectionSchema,
  deleteContractSectionSchema,
} from "./contract-section.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { createPdfUpload, handleMulterError } from "../../utils/s3Upload.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);

const upload = createPdfUpload("contract-section");

router.post(
  "/",
  upload.single("sectionUrl"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createContractSectionSchema, REQUEST_SOURCE.FORM_DATA),
  createContractSection,
);

router.get(
  "/",
  validateRequest(getAllContractSectionsSchema, REQUEST_SOURCE.QUERY),
  getAllContractSections,
);

router.get(
  "/:contract_section_id",
  validateRequest(getContractSectionByIdSchema, REQUEST_SOURCE.PARAMS),
  getContractSectionById,
);

router.put(
  "/:contract_section_id",
  upload.single("sectionUrl"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateContractSectionParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateContractSectionSchema, REQUEST_SOURCE.FORM_DATA),
  updateContractSection,
);

router.delete(
  "/:contract_section_id",
  validateRequest(deleteContractSectionSchema, REQUEST_SOURCE.PARAMS),
  deleteContractSection,
);

export default router;
