import express from "express";
import {
  createNote,
  getAllNotes,
  getNoteById,
  updateNote,
  deleteNote,
} from "./notes.controller.js";
import {
  createNoteSchema,
  updateNoteSchema,
  getAllNotesSchema,
  noteParamsSchema,
} from "./notes.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  createUpload("notes").single("attachFile"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createNoteSchema, REQUEST_SOURCE.FORM_DATA),
  createNote,
);

router.get(
  "/",
  validateRequest(getAllNotesSchema, REQUEST_SOURCE.QUERY),
  getAllNotes,
);

router.get("/:notes_id", getNoteById);

router.put(
  "/:notes_id",
  createUpload("notes").single("attachFile"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(noteParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateNoteSchema, REQUEST_SOURCE.FORM_DATA),
  updateNote,
);

router.delete(
  "/:notes_id",
  validateRequest(noteParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteNote,
);

export default router;
