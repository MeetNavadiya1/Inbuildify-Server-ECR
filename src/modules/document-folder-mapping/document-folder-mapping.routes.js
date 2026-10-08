import express from "express";

const router = express.Router();

import { getAllDocumentFolderMappings, updateDocumentFolderMapping } from "./document-folder-mapping.controller.js";
import { getAllDocumentFolderMappingsSchema, updateDocumentFolderMappingSchema } from "./document-folder-mapping.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get(
  "/",
  validateRequest(getAllDocumentFolderMappingsSchema, REQUEST_SOURCE.QUERY),
  getAllDocumentFolderMappings,
);

router.put(
  "/",
  validateRequest(updateDocumentFolderMappingSchema, REQUEST_SOURCE.BODY),
  updateDocumentFolderMapping,
);

export default router;
