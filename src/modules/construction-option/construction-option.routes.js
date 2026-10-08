import express from "express";

const router = express.Router();

import {
  createConstructionOption,
  getAllConstructionOptions,
  deleteConstructionOption,
  updateConstructionOption,
} from "./construction-option.controller.js";
import {
  createConstructionOptionSchema,
  deleteConstructionOptionSchema,
  updateConstructionOptionParamsSchema,
  updateConstructionOptionSchema,
} from "./construction-option.validation.js";
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
  validateRequest(createConstructionOptionSchema, REQUEST_SOURCE.BODY),
  createConstructionOption,
);

router.get("/", getAllConstructionOptions);

router.put(
  "/:id",
  validateRequest(updateConstructionOptionParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateConstructionOptionSchema, REQUEST_SOURCE.BODY),
  updateConstructionOption,
);

router.delete(
  "/:id",
  validateRequest(deleteConstructionOptionSchema, REQUEST_SOURCE.PARAMS),
  deleteConstructionOption,
);

export default router;
