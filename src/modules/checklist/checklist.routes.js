import express from "express";

const router = express.Router();

import {
  createChecklist,
  getAllChecklist,
  deleteChecklist,
  updateChecklist,
  updateChecklistIsActive,
} from "./checklist.controller.js";
import {
  createChecklistSchema,
  getAllChecklistSchema,
  deleteChecklistSchema,
  updateChecklistSchema,
  updateChecklistParamsSchema,
  updateChecklistIsActiveSchema,
} from "./checklist.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get("/", getAllChecklist);

router.get(
  "/:checklist_id",
  validateRequest(getAllChecklistSchema, REQUEST_SOURCE.PARAMS),
  getAllChecklist,
);

router.post(
  "/",
  validateRequest(createChecklistSchema, REQUEST_SOURCE.BODY),
  createChecklist,
);

router.put(
  "/:checklist_id",
  validateRequest(updateChecklistParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateChecklistSchema, REQUEST_SOURCE.BODY),
  updateChecklist,
);

router.put(
  "/is-active/:checklist_id",
  validateRequest(updateChecklistParamsSchema, REQUEST_SOURCE.PARAMS),
  updateChecklistIsActive,
);

router.delete(
  "/:checklist_id",
  validateRequest(deleteChecklistSchema, REQUEST_SOURCE.PARAMS),
  deleteChecklist,
);

export default router;
