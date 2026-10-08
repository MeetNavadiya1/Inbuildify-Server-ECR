import express from "express";

const router = express.Router();

import {
  createConstructionInspectionChecklist,
  getConstructionInspectionChecklists,
  updateConstructionInspectionChecklist,
  deleteConstructionInspectionChecklist,
  getConstructionInspectionChecklistById,
} from "./construction-inspection-checklist.controller.js";
import {
  createConstructionInspectionChecklistSchema,
  getConstructionInspectionChecklistsSchema,
  updateConstructionInspectionChecklistSchema,
  deleteConstructionInspectionChecklistSchema,
  updateExistingJobsSchema,
} from "./construction-inspection-checklist.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import caseConverterMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(caseConverterMiddleware);

router.post(
  "/",
  validateRequest(
    createConstructionInspectionChecklistSchema,
    REQUEST_SOURCE.BODY,
  ),
  createConstructionInspectionChecklist,
);

router.get(
  "/",
  validateRequest(
    getConstructionInspectionChecklistsSchema,
    REQUEST_SOURCE.QUERY,
  ),
  getConstructionInspectionChecklists,
);

router.get(
  "/:id",
  validateRequest(
    deleteConstructionInspectionChecklistSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  getConstructionInspectionChecklistById,
);

router.put(
  "/:id",
  validateRequest(
    deleteConstructionInspectionChecklistSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(
    updateConstructionInspectionChecklistSchema,
    REQUEST_SOURCE.BODY,
  ),
  updateConstructionInspectionChecklist,
);

router.delete(
  "/:id",
  validateRequest(updateExistingJobsSchema, REQUEST_SOURCE.BODY),
  validateRequest(
    deleteConstructionInspectionChecklistSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  deleteConstructionInspectionChecklist,
);

export default router;
