import express from "express";

const router = express.Router();

import {
  createNotesTag,
  getAllNoteTag,
  deleteNoteTag,
  updateNoteTag,
  updateNoteTagIsActive,
} from "./note-tag.controller.js";

import {
  createNoteTageSchema,
  getAllNoteTagSchema,
  deleteNoteTagSchema,
  updateNoteTagIdParamsSchema,
  updateNoteTagSchema,
  updateNoteTagIsActiveSchema,
} from "./note-tag.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get(
  "/",
  validateRequest(getAllNoteTagSchema, REQUEST_SOURCE.PARAMS),
  getAllNoteTag,
);

router.post(
  "/",
  validateRequest(createNoteTageSchema, REQUEST_SOURCE.BODY),
  createNotesTag,
);

router.put(
  "/:id",
  validateRequest(updateNoteTagIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateNoteTagSchema, REQUEST_SOURCE.BODY),
  updateNoteTag,
);

router.put(
  "/is-active/:id",
  validateRequest(updateNoteTagIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateNoteTagIsActiveSchema, REQUEST_SOURCE.BODY),
  updateNoteTagIsActive,
);

router.delete(
  "/:id",
  validateRequest(deleteNoteTagSchema, REQUEST_SOURCE.PARAMS),
  deleteNoteTag,
);

export default router;
