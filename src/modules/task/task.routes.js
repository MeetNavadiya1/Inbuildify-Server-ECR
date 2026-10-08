import express from "express";

const router = express.Router();

import { createTask, getAllTasks, deleteTask, updateTask } from "./task.controller.js";
import {
  createTaskSchema,
  getAllTaskSchema,
  deleteTaskSchema,
  updateTaskParamsSchema,
  updateTaskSchema,
} from "./task.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";

router.use(authMiddleware);
router.use(roleMiddleware);
const upload = createUpload("task");

router.post(
  "/",
  upload.fields([{ name: "attachFiles", maxCount: 1 }]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createTaskSchema, REQUEST_SOURCE.FORM_DATA),
  createTask,
);

router.get(
  "/",
  validateRequest(getAllTaskSchema, REQUEST_SOURCE.QUERY),
  getAllTasks,
);

router.delete(
  "/:task_id",
  validateRequest(deleteTaskSchema, REQUEST_SOURCE.PARAMS),
  deleteTask,
);

router.put(
  "/:task_id",
  upload.fields([{ name: "attachFiles", maxCount: 1 }]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateTaskParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateTaskSchema, REQUEST_SOURCE.FORM_DATA),
  updateTask,
);

export default router;
