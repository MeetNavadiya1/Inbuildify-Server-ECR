import express from "express";

const router = express.Router();

import {
  createClientType,
  getAllClientType,
  deleteClientType,
  updateClientType,
  updateClientTypeIsActive,
} from "./client-type.controller.js";
import {
  createClientTypeSchema,
  getAllClientTypeSchema,
  deleteClientTypeSchema,
  updateClientTypeParamsSchema,
  updateClientTypeSchema,
  updateClientTypeIsActiveSchema,
} from "./client-type.validation.js";
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
  validateRequest(createClientTypeSchema, REQUEST_SOURCE.BODY),
  createClientType,
);

router.get(
  "/",
  validateRequest(getAllClientTypeSchema, REQUEST_SOURCE.QUERY),
  getAllClientType,
);

router.delete(
  "/:id",
  validateRequest(deleteClientTypeSchema, REQUEST_SOURCE.PARAMS),
  deleteClientType,
);

router.put(
  "/:id",
  validateRequest(updateClientTypeParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateClientTypeSchema, REQUEST_SOURCE.BODY),
  updateClientType,
);

router.put(
  "/is-active/:id",
  validateRequest(updateClientTypeParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateClientTypeIsActiveSchema, REQUEST_SOURCE.BODY),
  updateClientTypeIsActive,
);

export default router;
