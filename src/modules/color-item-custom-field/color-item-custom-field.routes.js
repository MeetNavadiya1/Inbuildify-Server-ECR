import express from "express";

const router = express.Router();

import {
  createColorItemCustomField,
  getColorItemCustomFields,
  getColorItemCustomFieldById,
  updateColorItemCustomField,
  deleteColorItemCustomField,
} from "./color-item-custom-field.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createColorItemCustomFieldSchema, updateColorItemCustomFieldSchema } from "./color-item-custom-field.validation.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.post(
  "/",
  camelToSnakeMiddleware,
  validateRequest(createColorItemCustomFieldSchema, REQUEST_SOURCE.BODY),
  createColorItemCustomField,
);

router.get("/", getColorItemCustomFields);

router.get("/:id", getColorItemCustomFieldById);

router.put(
  "/:id",
  camelToSnakeMiddleware,
  validateRequest(updateColorItemCustomFieldSchema, REQUEST_SOURCE.BODY),
  updateColorItemCustomField,
);

router.delete("/:id", deleteColorItemCustomField);

export default router;
