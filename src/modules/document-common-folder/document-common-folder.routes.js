import express from "express";

const router = express.Router();

import {
  createDocumentCommonFolder,
  getAllDocumentCommonFolders,
  deleteDocumentCommonFolder,
  updateDocumentCommonFolder,
  seedDefaultDocumentFolders,
  seedDefaultFolders,
} from "./document-common-folder.controller.js";
import {
  createDocumentCommonFolderSchema,
  getAllDocumentCommonFolderSchema,
  deleteDocumentCommonFolderSchema,
  updateDocumentCommonFolderParamsSchema,
  updateDocumentCommonFolderSchema,
} from "./document-common-folder.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post("/seed-defaults", seedDefaultFolders);

router.post(
  "/",
  validateRequest(createDocumentCommonFolderSchema, REQUEST_SOURCE.BODY),
  createDocumentCommonFolder,
);

router.post("/seed-defaults", seedDefaultDocumentFolders);

router.get(
  "/",
  validateRequest(getAllDocumentCommonFolderSchema, REQUEST_SOURCE.QUERY),
  getAllDocumentCommonFolders,
);

router.delete(
  "/:document_common_folder_id",
  validateRequest(deleteDocumentCommonFolderSchema, REQUEST_SOURCE.PARAMS),
  deleteDocumentCommonFolder,
);

router.put(
  "/:document_common_folder_id",
  validateRequest(
    updateDocumentCommonFolderParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updateDocumentCommonFolderSchema, REQUEST_SOURCE.BODY),
  updateDocumentCommonFolder,
);

export default router;
