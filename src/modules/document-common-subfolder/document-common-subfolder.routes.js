import express from "express";

const router = express.Router();

import {
  createDocumentCommonSubfolder,
  getDocumentCommonSubfolderByFolderId,
  getDocumentCommonSubfolderTree,
  deleteDocumentCommonSubfolder,
  updateDocumentCommonSubfolder,
} from "./document-common-subfolder.controller.js";
import {
  createDocumentCommonSubfolderSchem,
  getDocumentCommonSubfolderByFolderIdParamsSchema,
  getDocumentCommonSubfolderByFolderIdSchema,
  getDocumentCommonSubfolderByParentIdSchema,
  deleteDocumentCommonSubfolderSchema,
  updateDocumentCommonSubfolderParamsSchema,
  updateDocumentCommonSubfolderSchema,
} from "./document-common-subfolder.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createDocumentCommonSubfolderSchem, REQUEST_SOURCE.BODY),
  createDocumentCommonSubfolder,
);

router.get(
  "/:document_common_folder_id",
  validateRequest(
    getDocumentCommonSubfolderByFolderIdParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(
    getDocumentCommonSubfolderByParentIdSchema,
    REQUEST_SOURCE.QUERY,
  ),
  getDocumentCommonSubfolderByFolderId,
);

router.get(
  "/:document_common_folder_id/tree",
  validateRequest(
    getDocumentCommonSubfolderByFolderIdParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  getDocumentCommonSubfolderTree,
);

router.delete(
  "/:document_common_subfolder_id",
  validateRequest(deleteDocumentCommonSubfolderSchema, REQUEST_SOURCE.PARAMS),
  deleteDocumentCommonSubfolder,
);

router.put(
  "/:document_common_subfolder_id",
  validateRequest(
    updateDocumentCommonSubfolderParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updateDocumentCommonSubfolderSchema, REQUEST_SOURCE.BODY),
  updateDocumentCommonSubfolder,
);

export default router;
