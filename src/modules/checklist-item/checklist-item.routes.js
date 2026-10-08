import express from "express";

const router = express.Router();

import {
  createChecklistItem,
  getChecklistItemsByChecklistId,
  deleteChecklistItem,
  updateChecklistItem,
} from "./checklist-item.controller.js";
import {
  createChecklistItemSchema,
  getChecklistItemsByChecklistIdSchema,
  deleteChecklistItemSchema,
  updateChecklistItemParamsSchema,
  updateChecklistItemSchema,
} from "./checklist-item.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createChecklistItemSchema, REQUEST_SOURCE.BODY),
  createChecklistItem,
);

router.get(
  "/:checklist_id",
  validateRequest(getChecklistItemsByChecklistIdSchema, REQUEST_SOURCE.PARAMS),
  getChecklistItemsByChecklistId,
);

router.delete(
  "/:checklist_item_id",
  validateRequest(deleteChecklistItemSchema, REQUEST_SOURCE.PARAMS),
  deleteChecklistItem,
);

router.put(
  "/:checklist_item_id",
  validateRequest(updateChecklistItemParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateChecklistItemSchema, REQUEST_SOURCE.BODY),
  updateChecklistItem,
);

export default router;
