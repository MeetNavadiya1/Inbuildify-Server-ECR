import express from "express";

const router = express.Router();

import {
  createConstructionChecklistPredecessor,
  getAllConstructionChecklistPredecessors,
  getConstructionChecklistPredecessorById,
  updateConstructionChecklistPredecessor,
  deleteConstructionChecklistPredecessor,
} from "./construction-checklist-predecessor.controller.js";
import {
  createConstructionChecklistPredecessorValidation,
  updateConstructionChecklistPredecessorValidation,
  getConstructionChecklistPredecessorByIdValidation,
  queryValidation,
} from "./construction-checklist-predecessor.validation.js";
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
  validateRequest(createConstructionChecklistPredecessorValidation, REQUEST_SOURCE.BODY),
  createConstructionChecklistPredecessor,
);

router.get(
  "/",
  validateRequest(queryValidation, REQUEST_SOURCE.QUERY),
  getAllConstructionChecklistPredecessors,
);

router.get(
  "/:construction_checklist_predecessor_id",
  validateRequest(getConstructionChecklistPredecessorByIdValidation, REQUEST_SOURCE.PARAMS),
  getConstructionChecklistPredecessorById,
);

router.put(
  "/:construction_checklist_predecessor_id",
  validateRequest(getConstructionChecklistPredecessorByIdValidation, REQUEST_SOURCE.PARAMS),
  validateRequest(updateConstructionChecklistPredecessorValidation, REQUEST_SOURCE.BODY),
  updateConstructionChecklistPredecessor,
);

router.delete(
  "/:construction_checklist_predecessor_id",
  validateRequest(getConstructionChecklistPredecessorByIdValidation, REQUEST_SOURCE.PARAMS),
  deleteConstructionChecklistPredecessor,
);

export default router;
