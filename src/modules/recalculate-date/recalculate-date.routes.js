import express from "express";

const router = express.Router();

import { getRecalculateDate, updateRecalculateDate } from "./recalculate-date..controller.js";
import {  updateRecalculateDateSchema } from "./recalculate-date.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get("/", getRecalculateDate);

router.put(
  "/",
  validateRequest(updateRecalculateDateSchema, REQUEST_SOURCE.BODY),
  updateRecalculateDate,
);

export default router;
