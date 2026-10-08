import express from "express";

const router = express.Router();

import {
  createConstructionSubChecklist,
  getAllConstructionSubChecklists,
  getConstructionSubChecklistById,
  updateConstructionSubChecklist,
  deleteConstructionSubChecklist,
} from "./construction-sub-checklist.controller.js";
import {
  createConstructionSubChecklistValidation,
  updateConstructionSubChecklistValidation,
  getConstructionSubChecklistByIdValidation,
  queryValidation,
} from "./construction-sub-checklist.validation.js";
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
  validateRequest(createConstructionSubChecklistValidation, REQUEST_SOURCE.BODY),
  createConstructionSubChecklist,
);

router.get(
  "/",
  validateRequest(queryValidation, REQUEST_SOURCE.QUERY),
  getAllConstructionSubChecklists,
);

router.get(
  "/:construction_sub_checklist_id",
  validateRequest(getConstructionSubChecklistByIdValidation, REQUEST_SOURCE.PARAMS),
  getConstructionSubChecklistById,
);

router.put(
  "/:construction_sub_checklist_id",
  validateRequest(getConstructionSubChecklistByIdValidation, REQUEST_SOURCE.PARAMS),
  validateRequest(updateConstructionSubChecklistValidation, REQUEST_SOURCE.BODY),
  updateConstructionSubChecklist,
);

router.delete(
  "/:construction_sub_checklist_id",
  validateRequest(getConstructionSubChecklistByIdValidation, REQUEST_SOURCE.PARAMS),
  deleteConstructionSubChecklist,
);

export default router;
