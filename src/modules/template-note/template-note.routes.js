import express from "express";

const router = express.Router();

import {
  createTemplateNote,
  getAllTemplateNotes,
  updateTemplateNote,
  updateTemplateNoteIsActive,
} from "./template-note.controller.js";
import {
  createTemplateNoteSchema,
  getAllTemplateNotesSchema,
  updateTemplateNoteParamsSchema,
  updateTemplateNoteSchema,
} from "./template-note.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
//not fit orm
router.post(
  "/",
  validateRequest(createTemplateNoteSchema, REQUEST_SOURCE.BODY),
  createTemplateNote,
);

router.get(
  "/",
  validateRequest(getAllTemplateNotesSchema, REQUEST_SOURCE.QUERY),
  getAllTemplateNotes,
);

router.put(
  "/:template_note_id",
  validateRequest(updateTemplateNoteParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateTemplateNoteSchema, REQUEST_SOURCE.BODY),
  updateTemplateNote,
);

router.put(
  "/is-active/:template_note_id",
  validateRequest(updateTemplateNoteParamsSchema, REQUEST_SOURCE.PARAMS),
  updateTemplateNoteIsActive,
);
export default router;
