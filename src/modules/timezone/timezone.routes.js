import express from "express";

const router = express.Router();

import { getAllTimezones } from "./timezone.controller.js";
import { getAllTimezoneSchema } from "./timezone.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get(
  "/",
  validateRequest(getAllTimezoneSchema, REQUEST_SOURCE.QUERY),
  getAllTimezones,
);

export default router;
