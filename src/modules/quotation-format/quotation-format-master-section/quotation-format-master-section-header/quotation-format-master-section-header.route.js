import express from "express";

const router = express.Router();

import {

  createMasterSectionHeader,
  getMasterSectionHeaders,
  updateMasterSectionHeader,
  deleteMasterSectionHeader,
  copyMasterSectionHeader,
} from "./quotation-format-master-section-header.controller.js";
import roleMiddleware from "../../../../middleware/roleMiddleware.js";
import authMiddleware from "../../../../middleware/authMiddleware.js";
import camelToSnakeMiddleware from "../../../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../../../config/constants.js";

import {

  paramsMasterSectionIdSchema,
  createMasterSectionHeaderSchema,
  updateMasterSectionHeaderSchema,
  getMasterSectionHeaderSchema,
  paramsHeaderIdSchema,

} from "./quotation-format-master-section-header.validation.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

// ============================================================
//        MASTER SECTION HEADER ROUTES
// ============================================================
router.get(
  "/:master_section_id",
  validateRequest(paramsMasterSectionIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getMasterSectionHeaderSchema, REQUEST_SOURCE.QUERY),
  getMasterSectionHeaders,
);

router.post(
  "/:master_section_id",
  validateRequest(createMasterSectionHeaderSchema, REQUEST_SOURCE.BODY),
  validateRequest(paramsMasterSectionIdSchema, REQUEST_SOURCE.PARAMS),
  createMasterSectionHeader,
);

router.put(
  "/:header_id",
  validateRequest(paramsHeaderIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateMasterSectionHeaderSchema, REQUEST_SOURCE.BODY),
  updateMasterSectionHeader,
);

router.delete(
  "/:header_id",
  validateRequest(paramsHeaderIdSchema, REQUEST_SOURCE.PARAMS),
  deleteMasterSectionHeader,
);

router.post(
  "/:header_id/copy",
  validateRequest(paramsHeaderIdSchema, REQUEST_SOURCE.PARAMS),
  copyMasterSectionHeader,
);

export default router;
