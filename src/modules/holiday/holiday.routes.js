import express from "express";

const router = express.Router();

import {
  createHoliday,
  getAllHolidays,
  updateHoliday,
} from "./holiday.controller.js";
import {
  createHolidaySchema,
  getAllHolidaySchema,
  updateHolidayParamsSchema,
  updateHolidaySchema,
} from "./holiday.validation.js";
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
  validateRequest(createHolidaySchema, REQUEST_SOURCE.BODY),
  createHoliday,
);

router.get(
  "/",
  validateRequest(getAllHolidaySchema, REQUEST_SOURCE.QUERY),
  getAllHolidays,
);


router.put(
  "/:holiday_id",
  validateRequest(updateHolidayParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateHolidaySchema, REQUEST_SOURCE.BODY),
  updateHoliday,
);


export default router;
