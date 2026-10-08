import express from "express";

const router = express.Router();

import {
  createTodo,
  getAllTodos,
  getTodoById,
  updateTodo,
  deleteTodo,
} from "./todo.controller.js";
import {
  createTodoSchema,
  getAllTodosSchema,
  todoIdParamSchema,
  updateTodoSchema,
} from "./todo.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.get("/", validateRequest(getAllTodosSchema, REQUEST_SOURCE.QUERY), getAllTodos);

router.post("/", validateRequest(createTodoSchema, REQUEST_SOURCE.BODY), createTodo);

router.get(
  "/:todo_id",
  validateRequest(todoIdParamSchema, REQUEST_SOURCE.PARAMS),
  getTodoById,
);

router.put(
  "/:todo_id",
  validateRequest(todoIdParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateTodoSchema, REQUEST_SOURCE.BODY),
  updateTodo,
);

router.delete(
  "/:todo_id",
  validateRequest(todoIdParamSchema, REQUEST_SOURCE.PARAMS),
  deleteTodo,
);

export default router;
